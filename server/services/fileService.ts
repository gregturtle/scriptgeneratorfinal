import fs from "fs";
import path from "path";
import FormData from "form-data";
import { AdAccount, AdVideo, FacebookAdsApi } from 'facebook-nodejs-business-sdk';

// Facebook Graph API base URL
const FB_API_VERSION = "v23.0";
const FB_GRAPH_API = `https://graph.facebook.com/${FB_API_VERSION}`;

// Get ad account ID from environment variable
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "";

// Initialize Facebook SDK lazily (will be called when needed with fresh token)
function initFacebookApi(accessToken: string) {
  FacebookAdsApi.init(accessToken);
}

class FileService {
  /**
   * Upload a video file to Meta using the proven working approach:
   * - FormData with fs.createReadStream (not buffer)
   * - access_token as query parameter
   * - form.getHeaders() for proper Content-Type with boundary
   */
  async uploadFileToMeta(accessToken: string, filePath: string): Promise<{ id: string }> {
    try {
      console.log(`Starting Meta file upload for: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist at path: ${filePath}`);
      }
      
      const fileStats = fs.statSync(filePath);
      const fileSizeMB = fileStats.size / (1024 * 1024);
      console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
      
      let adAccountId = META_AD_ACCOUNT_ID;
      if (!adAccountId) {
        const adAccounts = await this.getAdAccounts(accessToken);
        if (adAccounts.length === 0) {
          throw new Error("No ad accounts found for this user");
        }
        adAccountId = adAccounts[0];
      }
      
      // Ensure account ID has 'act_' prefix
      const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
      console.log(`Using ad account: ${account}`);
      
      const videoName = path.basename(filePath, '.mp4');
      
      // Create FormData with file stream (not buffer - Meta expects a stream)
      const form = new FormData();
      form.append('source', fs.createReadStream(filePath));  // File as readable stream
      form.append('name', videoName);
      
      const uploadUrl = `https://graph.facebook.com/v21.0/${account}/advideos?access_token=${accessToken}`;
      console.log(`Uploading ${videoName} to Meta...`);
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: form as any,
        headers: form.getHeaders(),  // Critical: includes Content-Type with boundary
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error(`Meta video upload failed: ${error}`);
        throw new Error(`Meta video upload failed: ${error}`);
      }
      
      const result = await response.json() as any;
      console.log(`Upload successful. Video ID: ${result.id}`);
      return { id: result.id };

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
