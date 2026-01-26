import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
import path from 'path';
import fs from 'fs';

// Configure FFmpeg to use system binaries
ffmpeg.setFfmpegPath('/nix/store/jfybfbnknyiwggcrhi4v9rsx5g4hksvf-ffmpeg-full-6.1.1-bin/bin/ffmpeg');
ffmpeg.setFfprobePath('/nix/store/jfybfbnknyiwggcrhi4v9rsx5g4hksvf-ffmpeg-full-6.1.1-bin/bin/ffprobe');

console.log('FFmpeg configured with system paths');



interface VideoOverlayOptions {
  backgroundVideoPath: string;
  audioPath: string;
  outputPath: string;
  audioDuration?: number;
  fadeInDuration?: number;
  fadeOutDuration?: number;
  subtitlePath?: string; // Optional SRT file path
  includeSubtitles?: boolean; // Whether to burn subtitles
}

interface VideoCreationResult {
  success: boolean;
  outputPath?: string;
  outputUrl?: string;
  duration?: number;
  error?: string;
  driveId?: string;
  driveLink?: string;
  folderLink?: string;
}

class VideoService {
  private uploadsDir = path.join(process.cwd(), 'uploads');
  private videosDir = path.join(this.uploadsDir, 'videos');

  constructor() {
    // Ensure videos directory exists
    if (!fs.existsSync(this.videosDir)) {
      fs.mkdirSync(this.videosDir, { recursive: true });
    }
  }

  /**
   * Check if ffmpeg is available and working
   */
  async checkFfmpegAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      ffmpeg()
        .getAvailableFormats((err, formats) => {
          if (err) {
            console.error('FFmpeg check failed:', err);
            resolve(false);
          } else {
            console.log('FFmpeg is available with', Object.keys(formats).length, 'formats');
            resolve(true);
          }
        });
    });
  }

  /**
   * Get video information (duration, dimensions, etc.)
   */
  async getVideoInfo(videoPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(metadata);
        }
      });
    });
  }

  /**
   * Get audio duration in seconds
   */
  async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const duration = metadata.format?.duration || 0;
          resolve(Number(duration));
        }
      });
    });
  }

  /**
   * Overlay audio onto video with optional fade effects
   */
  async overlayAudioOnVideo(options: VideoOverlayOptions): Promise<VideoCreationResult> {
    try {
      const {
        backgroundVideoPath,
        audioPath,
        outputPath,
        fadeInDuration = 0.5,
        fadeOutDuration = 0.5,
        subtitlePath,
        includeSubtitles = false
      } = options;

      // Verify input files exist
      if (!fs.existsSync(backgroundVideoPath)) {
        throw new Error(`Background video not found: ${backgroundVideoPath}`);
      }
      if (!fs.existsSync(audioPath)) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // Get video and audio durations
      const videoInfo = await this.getVideoInfo(backgroundVideoPath);
      const audioDuration = await this.getAudioDuration(audioPath);
      const videoDuration = videoInfo.format?.duration || 0;

      console.log(`Video duration: ${videoDuration}s, Audio duration: ${audioDuration}s`);

      // Always use the full video duration to maintain original video length
      const targetDuration = videoDuration;

      // Prepare subtitle filter if subtitles are enabled
      let videoFilters: string[] = [];
      if (includeSubtitles && subtitlePath && fs.existsSync(subtitlePath)) {
        // Escape the subtitle path for FFmpeg (replace backslashes and colons)
        const escapedSubtitlePath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:');
        
        // Small subtitle styling at bottom - white text with subtle outline, bottom center
        const subtitleStyle = "force_style='FontName=Arial,FontSize=9,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,Outline=1,Shadow=1,MarginV=15,Alignment=2'";
        
        videoFilters.push(`subtitles=${escapedSubtitlePath}:${subtitleStyle}`);
        console.log(`Burning subtitles from: ${subtitlePath}`);
      }

      return new Promise((resolve, reject) => {
        const command = ffmpeg()
          .input(backgroundVideoPath)
          .input(audioPath)
          .audioFilters([
            `afade=t=in:st=0:d=${fadeInDuration}`,
            `afade=t=out:st=${audioDuration - fadeOutDuration}:d=${fadeOutDuration}`
          ]);

        // Apply video filters if subtitles are enabled
        if (videoFilters.length > 0) {
          command.videoFilters(videoFilters);
        }

        // Output options - use copy codec if no video filters, otherwise re-encode
        const outputOptions = [
          videoFilters.length > 0 ? '-c:v libx264' : '-c:v copy', // Re-encode video if burning subtitles
          videoFilters.length > 0 ? '-crf 23' : '', // Quality setting for encoding
          videoFilters.length > 0 ? '-preset fast' : '', // Encoding speed preset
          '-c:a aac',  // Encode audio as AAC
          '-map 0:v:0', // Map video from first input
          '-map 1:a:0', // Map audio from second input
          '-avoid_negative_ts make_zero',
          '-fflags +genpts'
        ].filter(opt => opt !== ''); // Remove empty options

        command
          .outputOptions(outputOptions)
          .duration(targetDuration)
          .output(outputPath)
          .on('start', (commandLine) => {
            console.log('FFmpeg process started:', commandLine);
          })
          .on('progress', (progress) => {
            console.log(`Processing: ${Math.round(progress.percent || 0)}% done`);
          })
          .on('end', () => {
            console.log('Video overlay completed successfully');
            
            // Verify output file was created
            if (fs.existsSync(outputPath)) {
              const stats = fs.statSync(outputPath);
              const outputUrl = `/uploads/videos/${path.basename(outputPath)}`;
              
              resolve({
                success: true,
                outputPath,
                outputUrl,
                duration: targetDuration,
              });
            } else {
              reject(new Error('Output file was not created'));
            }
          })
          .on('error', (err) => {
            console.error('FFmpeg error:', err);
            reject(err);
          });

        // Start the process
        command.run();
      });

    } catch (error) {
      console.error('Video overlay error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Create a video with audio overlay for a script suggestion
   */
  async createVideoForScript(
    scriptTitle: string,
    audioPath: string,
    backgroundVideoPath: string,
    scriptText?: string,
    includeSubtitles: boolean = false
  ): Promise<VideoCreationResult> {
    let subtitlePath: string | undefined;
    
    try {
      // Generate unique output filename with readable timestamp
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19); // Format: YYYY-MM-DD_HH-MM-SS
      const sanitizedTitle = scriptTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
      const outputFileName = `video_${sanitizedTitle}_${timestamp}.mp4`;
      const outputPath = path.join(this.videosDir, outputFileName);

      console.log(`Creating video: ${outputFileName}`);

      // Generate subtitle file if requested
      if (includeSubtitles && scriptText) {
        try {
          const { subtitleService } = await import('./subtitleService');
          const audioDuration = await this.getAudioDuration(audioPath);
          subtitlePath = await subtitleService.createSubtitleFile(
            scriptText,
            audioDuration,
            outputFileName
          );
          console.log(`Generated subtitle file: ${subtitlePath}`);
        } catch (subtitleError) {
          console.warn('Failed to generate subtitles, continuing without:', subtitleError);
        }
      }

      const result = await this.overlayAudioOnVideo({
        backgroundVideoPath,
        audioPath,
        outputPath,
        fadeInDuration: 0.3,
        fadeOutDuration: 0.5,
        subtitlePath,
        includeSubtitles: includeSubtitles && !!subtitlePath
      });

      // Auto-upload to Google Drive if successful
      if (result.success && result.outputPath) {
        try {
          const { googleDriveService } = await import('./googleDriveService');
          
          // Try uploading to user's Shared Drive with timestamped subfolder
          let driveResult;
          try {
            driveResult = await googleDriveService.uploadVideoToTimestampedFolder(
              result.outputPath,
              outputFileName,
              '1AIe9UvmYnBJiJyD1rMzLZRNqKDw-BWJh', // User's Shared Drive folder ID
              timestamp // Use same timestamp as filename for folder organization
            );
            console.log(`Video uploaded to timestamped subfolder: ${driveResult.webViewLink}`);
            console.log(`Timestamped folder link: ${driveResult.folderLink}`);
          } catch (sharedDriveError: any) {
            console.warn('Cannot access Shared Drive (permissions needed), using service account folder:', sharedDriveError.message);
            // Fallback to service account's own folder with timestamp
            driveResult = await googleDriveService.uploadVideoToFolder(
              result.outputPath,
              outputFileName,
              `Meta Campaign Videos - ${timestamp}`
            );
            console.log(`Video uploaded to service account folder: ${driveResult.webViewLink}`);
          }
          
          // Clean up local video file after successful upload
          try {
            if (result.outputPath && fs.existsSync(result.outputPath)) {
              fs.unlinkSync(result.outputPath);
              console.log(`Cleaned up local video file: ${result.outputPath}`);
            }
          } catch (cleanupError) {
            console.warn('Failed to clean up local video file:', cleanupError);
          }
          
          // Add Drive link to result and include folder info
          return {
            ...result,
            driveId: driveResult.id,
            driveLink: driveResult.webViewLink,
            folderLink: (driveResult as any).folderLink
          };
        } catch (driveError) {
          console.warn('Failed to auto-upload to Google Drive:', driveError);
          // Continue without failing the video creation
        }
      }

      return result;

    } catch (error) {
      console.error('Error creating video for script:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create video'
      };
    } finally {
      // Clean up subtitle file
      if (subtitlePath) {
        try {
          const { subtitleService } = await import('./subtitleService');
          subtitleService.deleteSubtitleFile(subtitlePath);
        } catch (cleanupError) {
          console.warn('Failed to clean up subtitle file:', cleanupError);
        }
      }
    }
  }

  /**
   * Create video for a single script as part of a batch (uploads to existing batch folder)
   */
  async createVideoForScriptInBatch(
    scriptTitle: string,
    audioFilePath: string,
    backgroundVideoPath: string,
    batchTimestamp: string,
    batchFolderId?: string | null,
    scriptIndex: number = 0,
    scriptText?: string,
    includeSubtitles: boolean = false
  ): Promise<VideoCreationResult> {
    let subtitlePath: string | undefined;
    
    try {
      const timestamp = batchTimestamp; // Use batch timestamp for consistency
      const safeTitle = scriptTitle.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 40);
      const outputFileName = `script${scriptIndex + 1}_video_${safeTitle}_${timestamp}.mp4`;
      const outputPath = path.join(this.videosDir, outputFileName);

      console.log(`Creating video: ${outputFileName}`);

      if (!fs.existsSync(audioFilePath)) {
        throw new Error(`Audio file not found: ${audioFilePath}`);
      }

      if (!fs.existsSync(backgroundVideoPath)) {
        throw new Error(`Background video not found: ${backgroundVideoPath}`);
      }

      // Generate subtitle file if requested
      if (includeSubtitles && scriptText) {
        try {
          const { subtitleService } = await import('./subtitleService');
          const audioDuration = await this.getAudioDuration(audioFilePath);
          subtitlePath = await subtitleService.createSubtitleFile(
            scriptText,
            audioDuration,
            outputFileName
          );
          console.log(`Generated subtitle file: ${subtitlePath}`);
        } catch (subtitleError) {
          console.warn('Failed to generate subtitles, continuing without:', subtitleError);
        }
      }

      const result = await this.overlayAudioOnVideo({
        backgroundVideoPath,
        audioPath: audioFilePath,
        outputPath,
        fadeInDuration: 0.3,
        fadeOutDuration: 0.5,
        subtitlePath,
        includeSubtitles: includeSubtitles && !!subtitlePath
      });

      // Auto-upload to Google Drive batch folder if successful
      if (result.success && result.outputPath && batchFolderId) {
        try {
          console.log(`Attempting to upload ${outputFileName} to batch folder ${batchFolderId}`);
          const { googleDriveService } = await import('./googleDriveService');
          
          const driveResult = await googleDriveService.uploadVideoToSpecificFolder(
            result.outputPath,
            outputFileName,
            batchFolderId
          );

          console.log(`Successfully uploaded ${outputFileName} to batch folder. File ID: ${driveResult.id}`);
          console.log(`Drive result details:`, {
            id: driveResult.id,
            webViewLink: driveResult.webViewLink,
            name: driveResult.name
          });

          // Clean up local video file after successful upload
          try {
            if (result.outputPath && fs.existsSync(result.outputPath)) {
              fs.unlinkSync(result.outputPath);
              console.log(`Cleaned up local video file: ${result.outputPath}`);
            }
          } catch (cleanupError) {
            console.warn('Failed to clean up local video file:', cleanupError);
          }

          return {
            ...result,
            driveId: driveResult.id,
            driveLink: driveResult.webViewLink,
            folderLink: `https://drive.google.com/drive/folders/${batchFolderId}`
          };
        } catch (driveError) {
          console.error('Failed to upload to batch folder - detailed error:', driveError);
          // Continue without failing the video creation
        }
      } else {
        console.log(`Skipping Google Drive upload for ${outputFileName}:`, {
          success: result.success,
          hasOutputPath: !!result.outputPath,
          hasBatchFolderId: !!batchFolderId
        });
      }

      return result;

    } catch (error) {
      console.error('Error creating video for script in batch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create video'
      };
    } finally {
      // Clean up subtitle file
      if (subtitlePath) {
        try {
          const { subtitleService } = await import('./subtitleService');
          subtitleService.deleteSubtitleFile(subtitlePath);
        } catch (cleanupError) {
          console.warn('Failed to clean up subtitle file:', cleanupError);
        }
      }
    }
  }

  /**
   * Process multiple scripts and create videos for each - uploads all to one timestamped batch folder
   */
  async createVideosForScripts(
    suggestions: Array<{
      title: string;
      content: string;
      audioFile?: string;
      audioUrl?: string;
    }>,
    backgroundVideoPath: string,
    includeSubtitles: boolean = false
  ): Promise<Array<{
    title: string;
    content: string;
    audioFile?: string;
    audioUrl?: string;
    videoFile?: string;
    videoUrl?: string;
    videoFileId?: string;
    videoError?: string;
    folderLink?: string;
  }>> {
    const results = [];
    
    // Create one timestamped folder for the entire batch
    const batchTimestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
    let batchFolderId: string | null = null;
    let batchFolderLink: string | null = null;

    // Try to create the batch folder upfront
    try {
      console.log(`Creating batch folder for ${suggestions.length} videos with timestamp: ${batchTimestamp}`);
      const { googleDriveService } = await import('./googleDriveService');
      if (googleDriveService.isConfigured()) {
        console.log('Google Drive service is configured, creating timestamped subfolder...');
        batchFolderId = await googleDriveService.createTimestampedSubfolder(
          '1AIe9UvmYnBJiJyD1rMzLZRNqKDw-BWJh',
          batchTimestamp
        );
        batchFolderLink = `https://drive.google.com/drive/folders/${batchFolderId}`;
        console.log(`Created batch folder for ${suggestions.length} videos: ${batchFolderLink} (ID: ${batchFolderId})`);
      } else {
        console.log('Google Drive service is not configured');
      }
    } catch (error) {
      console.error('Could not create batch folder, will fallback to individual uploads:', error);
    }

    for (let i = 0; i < suggestions.length; i++) {
      const suggestion = suggestions[i];
      
      if (!suggestion.audioFile || !fs.existsSync(suggestion.audioFile)) {
        console.log(`Skipping video creation for "${suggestion.title}" - no audio file`);
        results.push({
          ...suggestion,
          videoError: 'No audio file available'
        });
        continue;
      }

      console.log(`Creating video ${i + 1}/${suggestions.length}: ${suggestion.title}`);

      // Create video with the batch timestamp for consistent naming
      const videoResult = await this.createVideoForScriptInBatch(
        suggestion.title,
        suggestion.audioFile,
        backgroundVideoPath,
        batchTimestamp,
        batchFolderId,
        i,
        suggestion.content, // Pass script text for subtitle generation
        includeSubtitles
      );

      if (videoResult.success) {
        console.log(`Video result for "${suggestion.title}":`, {
          outputPath: videoResult.outputPath,
          driveId: videoResult.driveId,
          driveLink: videoResult.driveLink
        });
        
        // Log potential issue with missing driveId
        if (!videoResult.driveId) {
          console.error(`WARNING: No driveId returned for video "${suggestion.title}" - deletion will fail`);
        } else {
          console.log(`Successfully got driveId for "${suggestion.title}": ${videoResult.driveId}`);
        }
        
        results.push({
          ...suggestion,
          videoFile: videoResult.outputPath,
          videoUrl: videoResult.driveLink, // Use Google Drive link instead of outputUrl
          videoFileId: videoResult.driveId, // Add the Google Drive file ID
          folderLink: batchFolderLink || undefined
        });
      } else {
        results.push({
          ...suggestion,
          videoError: videoResult.error || 'Failed to create video'
        });
      }
    }

    return results;
  }

  /**
   * Get available background videos
   */
  getAvailableBackgroundVideos(): string[] {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
    const backgroundsDir = path.join(this.uploadsDir, 'backgrounds');
    
    if (!fs.existsSync(backgroundsDir)) {
      fs.mkdirSync(backgroundsDir, { recursive: true });
      return [];
    }

    return fs.readdirSync(backgroundsDir)
      .filter(file => videoExtensions.some(ext => file.toLowerCase().endsWith(ext)))
      .map(file => path.join(backgroundsDir, file));
  }

  /**
   * Clean up old video files (keep only last 50 videos)
   */
  async cleanupOldVideos(): Promise<void> {
    try {
      const files = fs.readdirSync(this.videosDir)
        .filter(file => file.endsWith('.mp4'))
        .map(file => ({
          name: file,
          path: path.join(this.videosDir, file),
          time: fs.statSync(path.join(this.videosDir, file)).mtime
        }))
        .sort((a, b) => b.time.getTime() - a.time.getTime());

      // Keep only the 50 most recent videos
      const filesToDelete = files.slice(50);

      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        console.log(`Cleaned up old video: ${file.name}`);
      }

      if (filesToDelete.length > 0) {
        console.log(`Cleaned up ${filesToDelete.length} old video files`);
      }
    } catch (error) {
      console.error('Error cleaning up old videos:', error);
    }
  }
}

export const videoService = new VideoService();