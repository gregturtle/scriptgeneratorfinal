import express from 'express';
import { googleDriveService } from '../services/googleDriveService';
import path from 'path';
import fs from 'fs';

const router = express.Router();

/**
 * Manually upload a video file to Google Drive
 */
router.post('/upload-video', async (req, res) => {
  try {
    const { videoPath, fileName, targetFolderId } = req.body;

    if (!videoPath || !fileName) {
      return res.status(400).json({ error: 'Video path and file name are required' });
    }

    const fullPath = path.join(process.cwd(), videoPath);
    
    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'Video file not found' });
    }

    let result;
    
    if (targetFolderId) {
      // Try uploading to specific folder
      try {
        result = await googleDriveService.uploadVideoToSpecificFolder(fullPath, fileName, targetFolderId);
      } catch (error) {
        // If specific folder fails, create service account folder
        console.warn('Specific folder upload failed, using service account folder');
        result = await googleDriveService.uploadVideoToFolder(fullPath, fileName, 'Meta Campaign Videos');
      }
    } else {
      // Use service account folder
      result = await googleDriveService.uploadVideoToFolder(fullPath, fileName, 'Meta Campaign Videos');
    }

    res.json({
      success: true,
      fileId: result.id,
      webViewLink: result.webViewLink,
      message: 'Video uploaded successfully to Google Drive'
    });

  } catch (error) {
    console.error('Error uploading video to Google Drive:', error);
    res.status(500).json({ 
      error: 'Failed to upload video to Google Drive',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get list of video files from local uploads directory
 */
router.get('/local-videos', async (req, res) => {
  try {
    const videosDir = path.join(process.cwd(), 'uploads', 'videos');
    
    if (!fs.existsSync(videosDir)) {
      return res.json({ videos: [], message: 'No videos directory found' });
    }

    const files = fs.readdirSync(videosDir).filter(file => file.endsWith('.mp4'));
    
    const videos = files.map(file => ({
      name: file,
      path: `uploads/videos/${file}`,
      fullPath: path.join(videosDir, file),
      size: fs.statSync(path.join(videosDir, file)).size,
      created: fs.statSync(path.join(videosDir, file)).mtime
    }));

    res.json({ videos, count: videos.length });

  } catch (error) {
    console.error('Error getting local videos:', error);
    res.status(500).json({ 
      error: 'Failed to get local videos',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;