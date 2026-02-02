import fs from "fs";
import path from "path";
import FormData from "form-data";
import axios from "axios";
import * as https from "https";
import { AdAccount, FacebookAdsApi } from 'facebook-nodejs-business-sdk';

// Facebook Graph API base URL
const FB_API_VERSION = "v23.0";
const FB_GRAPH_API = `https://graph.facebook.com/${FB_API_VERSION}`;
const FB_GRAPH_VIDEO_API = `https://graph-video.facebook.com/${FB_API_VERSION}`;

// Get ad account ID from environment variable
const META_AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID || "";

// Initialize Facebook SDK lazily (will be called when needed with fresh token)
function initFacebookApi(accessToken: string) {
  FacebookAdsApi.init(accessToken);
}

class FileService {
  /**
   * Upload a video file to Meta with streaming FormData and retry support.
   */
  async uploadFileToMeta(accessToken: string, filePath: string): Promise<{ id: string }> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist at path: ${filePath}`);
    }
    
    const fileStats = fs.statSync(filePath);
    const fileSizeMB = fileStats.size / (1024 * 1024);
    const timeoutMs = Math.max(60000, 60000 + Math.ceil(fileSizeMB / 10) * 30000);
    const httpsAgent = new https.Agent({ keepAlive: true });

    let adAccountId = META_AD_ACCOUNT_ID;
    if (!adAccountId) {
      const adAccounts = await this.getAdAccounts(accessToken);
      if (adAccounts.length === 0) {
        throw new Error("No ad accounts found for this user");
      }
      adAccountId = adAccounts[0];
    }
    
    const account = adAccountId.startsWith('act_') ? adAccountId : `act_${adAccountId}`;
    const videoName = path.basename(filePath, path.extname(filePath));
    const uploadUrl = `${FB_GRAPH_VIDEO_API}/${account}/advideos`;
    const forceResumable = ['1', 'true', 'yes'].includes(
      (process.env.META_UPLOAD_RESUMABLE || '').toLowerCase()
    );

    if (forceResumable) {
      console.log("META_UPLOAD_RESUMABLE enabled; using resumable upload flow.");
      return this.uploadFileToMetaResumable({
        accessToken,
        filePath,
        account,
        fileSizeBytes: fileStats.size,
        videoName,
        timeoutMs,
        httpsAgent,
      });
    }

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Starting Meta file upload (attempt ${attempt}/${maxRetries}): ${filePath}`);
        console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
        console.log(`Using ad account: ${account}`);

        const form = new FormData();
        form.append('access_token', accessToken);
        form.append('source', fs.createReadStream(filePath));
        form.append('name', videoName);

        const headers = form.getHeaders();
        try {
          const contentLength = await new Promise<number>((resolve, reject) => {
            form.getLength((err, length) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(length);
            });
          });
          headers['Content-Length'] = contentLength;
        } catch (lengthError) {
          console.warn('Could not determine upload content length; proceeding with chunked transfer.', lengthError);
        }

        console.log(`Uploading ${videoName} to Meta...`);

        const response = await axios.post(uploadUrl, form, {
          headers,
          timeout: timeoutMs,
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          httpsAgent,
        });

        const result = response.data as any;
        if (!result?.id) {
          throw new Error(`Meta video upload failed: ${JSON.stringify(result)}`);
        }

        console.log(`Upload successful. Video ID: ${result.id}`);
        return { id: result.id };

      } catch (error: any) {
        const metaError = error?.response?.data?.error;
        if (metaError) {
          console.error(`Meta video upload failed: ${JSON.stringify(metaError)}`);
        } else {
          console.error(`Error uploading file to Meta (attempt ${attempt}):`, error.message);
        }

        lastError = error;

        const isTransientTimeout = metaError?.code === 390 && metaError?.error_subcode === 1363030;
        if (isTransientTimeout) {
          console.warn("Meta returned a transient upload timeout. Switching to resumable upload flow...");
          try {
            return await this.uploadFileToMetaResumable({
              accessToken,
              filePath,
              account,
              fileSizeBytes: fileStats.size,
              videoName,
              timeoutMs,
              httpsAgent,
            });
          } catch (resumableError: any) {
            console.error("Resumable upload also failed:", resumableError?.message || resumableError);
            throw resumableError;
          }
        }

        if (error.code === 'ECONNABORTED') {
          throw new Error(`Upload timeout after ${timeoutMs / 1000}s - file may be too large (${fileSizeMB.toFixed(2)} MB)`);
        }

        if (error.code === 'ECONNRESET' || error.message?.includes('socket hang up')) {
          throw new Error(`Network connection lost during upload - try again or check file size (${fileSizeMB.toFixed(2)} MB)`);
        }

        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
    
    throw lastError || new Error('Upload failed after all retries');
  }

  private async uploadFileToMetaResumable(params: {
    accessToken: string;
    filePath: string;
    account: string;
    fileSizeBytes: number;
    videoName: string;
    timeoutMs: number;
    httpsAgent: https.Agent;
  }): Promise<{ id: string }> {
    const {
      accessToken,
      filePath,
      account,
      fileSizeBytes,
      videoName,
      timeoutMs,
      httpsAgent,
    } = params;

    const uploadUrl = `${FB_GRAPH_VIDEO_API}/${account}/advideos`;

    console.log(`Starting resumable upload for ${videoName} (${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB)`);

    // Start phase
    const startForm = new FormData();
    startForm.append('access_token', accessToken);
    startForm.append('upload_phase', 'start');
    startForm.append('file_size', fileSizeBytes.toString());
    startForm.append('name', videoName);

    const startResponse = await axios.post(uploadUrl, startForm, {
      headers: startForm.getHeaders(),
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      httpsAgent,
    });

    const startData = startResponse.data as any;
    const uploadSessionId = startData?.upload_session_id;
    const videoId = startData?.video_id;
    let startOffset = Number(startData?.start_offset ?? 0);
    let endOffset = Number(startData?.end_offset ?? 0);

    if (!uploadSessionId || Number.isNaN(startOffset) || Number.isNaN(endOffset)) {
      throw new Error(`Resumable upload start failed: ${JSON.stringify(startData)}`);
    }

    console.log(`Resumable upload session ${uploadSessionId} created. video_id=${videoId || 'unknown'}`);

    // Transfer phase
    while (startOffset < endOffset) {
      if (endOffset <= startOffset) {
        break;
      }
      const chunkEnd = Math.max(startOffset, endOffset - 1);
      const chunkStream = fs.createReadStream(filePath, { start: startOffset, end: chunkEnd });

      const transferForm = new FormData();
      transferForm.append('access_token', accessToken);
      transferForm.append('upload_phase', 'transfer');
      transferForm.append('upload_session_id', uploadSessionId);
      transferForm.append('start_offset', startOffset.toString());
      transferForm.append('video_file_chunk', chunkStream);

      const transferResponse = await axios.post(uploadUrl, transferForm, {
        headers: transferForm.getHeaders(),
        timeout: timeoutMs,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        httpsAgent,
      });

      const transferData = transferResponse.data as any;
      const nextStartOffset = Number(transferData?.start_offset);
      const nextEndOffset = Number(transferData?.end_offset);

      if (Number.isNaN(nextStartOffset) || Number.isNaN(nextEndOffset)) {
        throw new Error(`Resumable upload transfer failed: ${JSON.stringify(transferData)}`);
      }

      startOffset = nextStartOffset;
      endOffset = nextEndOffset;
      console.log(`Resumable upload progress: ${startOffset}/${fileSizeBytes} bytes`);
    }

    // Finish phase
    const finishForm = new FormData();
    finishForm.append('access_token', accessToken);
    finishForm.append('upload_phase', 'finish');
    finishForm.append('upload_session_id', uploadSessionId);

    const finishResponse = await axios.post(uploadUrl, finishForm, {
      headers: finishForm.getHeaders(),
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      httpsAgent,
    });

    const finishData = finishResponse.data as any;
    if (finishData?.success === false) {
      throw new Error(`Resumable upload finish failed: ${JSON.stringify(finishData)}`);
    }

    const resolvedVideoId = finishData?.video_id || videoId;
    if (!resolvedVideoId) {
      throw new Error(`Resumable upload finished without video_id: ${JSON.stringify(finishData)}`);
    }

    console.log(`Resumable upload completed. Video ID: ${resolvedVideoId}`);
    return { id: resolvedVideoId };
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
