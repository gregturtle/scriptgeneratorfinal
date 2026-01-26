import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import FormData from "form-data";
import { AdAccount, FacebookAdsApi } from 'facebook-nodejs-business-sdk';

// Facebook Graph API base URL
const FB_API_VERSION = "v18.0";
const FB_GRAPH_API = `https://graph.facebook.com/${FB_API_VERSION}`;

// Get ad account ID from environment variable
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "";

// Initialize Facebook SDK
FacebookAdsApi.init(process.env.META_ACCESS_TOKEN!, process.env.META_APP_SECRET!);

class FileService {
  /**
   * Upload a file to Meta's asset library
   */
  async uploadFileToMeta(accessToken: string, filePath: string): Promise<{ id: string }> {
    try {
      console.log(`Starting Meta file upload for: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist at path: ${filePath}`);
      }
      
      const fileStats = fs.statSync(filePath);
      console.log(`File size: ${fileStats.size} bytes, Last modified: ${fileStats.mtime}`);
      
      // Use the ad account ID from environment variable if available
      let adAccountId = META_AD_ACCOUNT_ID;
      console.log(`Using ad account ID: ${adAccountId}`);
      
      // Fallback to fetching accounts if no environment variable is set
      if (!adAccountId) {
        console.log("No ad account ID in environment, fetching from API...");
        const adAccounts = await this.getAdAccounts(accessToken);
        if (adAccounts.length === 0) {
          throw new Error("No ad accounts found for this user");
        }
        adAccountId = adAccounts[0];
        console.log(`Fetched ad account ID: ${adAccountId}`);
      }
      
      // Make sure adAccountId format is correct (should start with 'act_')
      if (!adAccountId.startsWith('act_')) {
        adAccountId = `act_${adAccountId}`;
        console.log(`Formatted ad account ID: ${adAccountId}`);
      }
      
      // Read the file
      console.log("Creating read stream for file...");
      const fileStream = fs.createReadStream(filePath);
      const formData = new FormData();
      
      formData.append("access_token", accessToken);
      formData.append("file", fileStream);
      
      console.log(`Sending request to: ${FB_GRAPH_API}/${adAccountId}/advideos`);
      
      // Test ad account access first
      console.log(`Testing ad account access for: ${adAccountId}`);
      const testResponse = await fetch(`${FB_GRAPH_API}/${adAccountId}?fields=id,name,account_status&access_token=${accessToken}`, {
        method: "GET"
      });
      
      if (!testResponse.ok) {
        const testError = await testResponse.text();
        console.error(`Ad account access test failed: ${testError}`);
        throw new Error(`Cannot access ad account ${adAccountId}: ${testError}`);
      }
      
      const accountInfo = await testResponse.json();
      console.log(`Ad account accessible:`, accountInfo);
      
      // Check file size and add timeout for large files
      const stats = fs.statSync(filePath);
      const fileSizeMB = stats.size / (1024 * 1024);
      console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
      
      // Calculate timeout based on file size (minimum 60s, +30s per 10MB)
      const timeoutMs = Math.max(60000, 60000 + Math.ceil(fileSizeMB / 10) * 30000);
      console.log(`Setting upload timeout to: ${timeoutMs / 1000}s`);
      
      // Add timeout control
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        console.log('Attempting video upload with optimized settings...');
        
        // Use the most reliable endpoint with proper headers
        const response = await fetch(`${FB_GRAPH_API}/${adAccountId}/advideos`, {
          method: "POST",
          body: formData as any,
          signal: controller.signal,
          headers: {
            'Connection': 'keep-alive',
          }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Upload error response: ${errorText}`);
          throw new Error(`Failed to upload file to Meta: ${errorText}`);
        }
        
        const data = await response.json() as any;
        console.log(`Upload successful. Received ID: ${data.id}`);
        return { id: data.id };
        
      } catch (uploadError: any) {
        clearTimeout(timeoutId);
        
        if (uploadError.name === 'AbortError') {
          throw new Error(`Upload timeout after ${timeoutMs / 1000}s - file may be too large (${fileSizeMB.toFixed(2)} MB)`);
        }
        
        if (uploadError.code === 'ECONNRESET' || uploadError.message.includes('socket hang up')) {
          throw new Error(`Network connection lost during upload - try again or check file size (${fileSizeMB.toFixed(2)} MB)`);
        }
        
        // Check for transient Meta API errors that should be retried
        if (uploadError.message && uploadError.message.includes('Service temporarily unavailable')) {
          throw new Error(`Meta API temporarily unavailable - this is a transient error, please try again in a few minutes`);
        }
        
        throw uploadError;
      }


    } catch (error) {
      console.error("Error uploading file to Meta:", error);
      throw error;
    }
  }

  /**
   * Uploads a local JPEG/PNG to Meta and returns the image_hash.
   * Uses the official SDK with Buffer instead of ReadStream for better compatibility.
   */
  async uploadImageToMeta(accessToken: string, imagePath: string): Promise<{hash: string}> {
    console.log(`Starting Meta image upload for: ${imagePath}`);
    
    // 1) sanity‐checks
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Thumbnail file not found: ${imagePath}`);
    }
    const stats = fs.statSync(imagePath);
    if (stats.size > 8 * 1024 * 1024) {
      throw new Error(
        `Thumbnail too large (${(stats.size/1e6).toFixed(1)} MB); must be ≤ 8MB`
      );
    }

    // 2) load into a Buffer (SDK often prefers this over streams)
    const fileName = path.basename(imagePath);
    const imageBuffer = fs.readFileSync(imagePath);

    // 3) ensure the AdAccount ID is prefixed correctly
    let accountId = META_AD_ACCOUNT_ID;
    if (!accountId.startsWith('act_')) accountId = 'act_' + accountId;
    const account = new AdAccount(accountId);

    try {
      console.log(`Uploading image using SDK with Buffer...`);
      
      // 4) call the SDK with a Buffer under `bytes`
      //    and explicitly give it a filename+contentType
      const response = await account.createAdImage(
        ['images{hash,url}'],
        {
          bytes: imageBuffer,
          filename: fileName,
          contentType: fileName.toLowerCase().endsWith('.png')
            ? 'image/png'
            : 'image/jpeg'
        }
      );

      // 5) extract & return the hash
      const images = (response as any).images;
      const firstKey = Object.keys(images)[0];
      const hash = images[firstKey].hash;
      console.log(`✅ Thumbnail uploaded, image_hash=${hash}`);
      return { hash };
    } catch (error) {
      console.error('SDK image upload failed:', error);
      throw new Error(`Failed to upload image to Meta: ${error}`);
    }
  }
  
  /**
   * Get ad account ID for the user
   * (Duplicate from metaApi.ts to avoid circular dependencies)
   */
  private async getAdAccounts(accessToken: string): Promise<string[]> {
    const response = await fetch(`${FB_GRAPH_API}/me/adaccounts?fields=id&access_token=${accessToken}`, {
      method: "GET",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get ad accounts: ${errorText}`);
    }

    const data = await response.json() as any;
    return data.data.map((account: any) => account.id);
  }
}

export const fileService = new FileService();
