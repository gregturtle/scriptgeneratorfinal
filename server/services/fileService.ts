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
   * Upload a file to Meta's asset library using chunked/resumable upload for reliability
   */
  async uploadFileToMeta(accessToken: string, filePath: string): Promise<{ id: string }> {
    try {
      console.log(`Starting Meta file upload for: ${filePath}`);
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File does not exist at path: ${filePath}`);
      }
      
      const fileStats = fs.statSync(filePath);
      const fileSize = fileStats.size;
      const fileSizeMB = fileSize / (1024 * 1024);
      console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
      
      let adAccountId = META_AD_ACCOUNT_ID;
      if (!adAccountId) {
        const adAccounts = await this.getAdAccounts(accessToken);
        if (adAccounts.length === 0) {
          throw new Error("No ad accounts found for this user");
        }
        adAccountId = adAccounts[0];
      }
      
      if (!adAccountId.startsWith('act_')) {
        adAccountId = `act_${adAccountId}`;
      }
      console.log(`Using ad account ID: ${adAccountId}`);

      const fileName = path.basename(filePath);
      
      // Use chunked upload for files > 5MB, direct for smaller
      if (fileSizeMB > 5) {
        return await this.uploadVideoChunked(accessToken, adAccountId, filePath, fileName, fileSize);
      } else {
        return await this.uploadVideoDirect(accessToken, adAccountId, filePath, fileName);
      }
    } catch (error) {
      console.error("Error uploading file to Meta:", error);
      throw error;
    }
  }

  /**
   * Direct upload for smaller files
   */
  private async uploadVideoDirect(accessToken: string, adAccountId: string, filePath: string, fileName: string): Promise<{ id: string }> {
    console.log(`Using direct upload for ${fileName}`);
    
    const formData = new FormData();
    formData.append('title', fileName.replace('.mp4', ''));
    formData.append('source', fs.createReadStream(filePath));
    
    const response = await fetch(
      `${FB_GRAPH_API}/${adAccountId}/advideos?access_token=${accessToken}`,
      {
        method: 'POST',
        body: formData as any,
        headers: formData.getHeaders(),
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Direct upload failed: ${errorText}`);
    }
    
    const data = await response.json() as any;
    console.log(`Direct upload successful. Video ID: ${data.id}`);
    return { id: data.id };
  }

  /**
   * Chunked/resumable upload for larger files - more reliable
   */
  private async uploadVideoChunked(
    accessToken: string, 
    adAccountId: string, 
    filePath: string, 
    fileName: string,
    fileSize: number
  ): Promise<{ id: string }> {
    console.log(`Using chunked upload for ${fileName} (${(fileSize / (1024*1024)).toFixed(2)} MB)`);
    
    // Phase 1: Start - initialize upload session
    console.log(`[Chunked Upload] Phase 1: Starting upload session...`);
    const startResponse = await fetch(
      `${FB_GRAPH_API}/${adAccountId}/advideos?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_phase: 'start',
          file_size: fileSize,
        }),
      }
    );
    
    if (!startResponse.ok) {
      const errorText = await startResponse.text();
      throw new Error(`Chunked upload start failed: ${errorText}`);
    }
    
    const startData = await startResponse.json() as any;
    const uploadSessionId = startData.upload_session_id;
    const videoId = startData.video_id;
    console.log(`[Chunked Upload] Session started. Session ID: ${uploadSessionId}, Video ID: ${videoId}`);
    
    // Phase 2: Transfer - upload in 4MB chunks
    const chunkSize = 4 * 1024 * 1024; // 4MB chunks
    const fileBuffer = fs.readFileSync(filePath);
    let startOffset = 0;
    let chunkNum = 1;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    while (startOffset < fileSize) {
      const endOffset = Math.min(startOffset + chunkSize, fileSize);
      const chunk = fileBuffer.slice(startOffset, endOffset);
      
      console.log(`[Chunked Upload] Phase 2: Uploading chunk ${chunkNum}/${totalChunks} (${startOffset}-${endOffset})`);
      
      const formData = new FormData();
      formData.append('upload_phase', 'transfer');
      formData.append('upload_session_id', uploadSessionId);
      formData.append('start_offset', startOffset.toString());
      formData.append('video_file_chunk', chunk, { filename: fileName });
      
      const transferResponse = await fetch(
        `${FB_GRAPH_API}/${adAccountId}/advideos?access_token=${accessToken}`,
        {
          method: 'POST',
          body: formData as any,
          headers: formData.getHeaders(),
        }
      );
      
      if (!transferResponse.ok) {
        const errorText = await transferResponse.text();
        throw new Error(`Chunk ${chunkNum} upload failed: ${errorText}`);
      }
      
      const transferData = await transferResponse.json() as any;
      startOffset = parseInt(transferData.start_offset || endOffset.toString());
      chunkNum++;
    }
    
    // Phase 3: Finish - finalize upload
    console.log(`[Chunked Upload] Phase 3: Finishing upload...`);
    const finishResponse = await fetch(
      `${FB_GRAPH_API}/${adAccountId}/advideos?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upload_phase: 'finish',
          upload_session_id: uploadSessionId,
          title: fileName.replace('.mp4', ''),
        }),
      }
    );
    
    if (!finishResponse.ok) {
      const errorText = await finishResponse.text();
      throw new Error(`Chunked upload finish failed: ${errorText}`);
    }
    
    const finishData = await finishResponse.json() as any;
    console.log(`[Chunked Upload] Complete. Video ID: ${finishData.video_id || videoId}`);
    
    return { id: finishData.video_id || videoId };
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
