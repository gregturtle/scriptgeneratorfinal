import express, { Request } from "express";
import { createServer, type Server } from "http";
import { storage as appStorage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { z } from "zod";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { 
  insertFileSchema, 
  insertActivityLogSchema, 
  insertCampaignSchema,
  insertCreativeSchema
} from "@shared/schema";
import { metaApiService } from "./services/metaApi";
import { fileService } from "./services/fileService";
import { performanceReportService } from "./services/performanceReportService";
import { aiScriptService } from "./services/aiScriptService";
import { elevenLabsService } from "./services/elevenLabsService";
import { videoService } from "./services/videoService";
import { googleDriveService } from "./services/googleDriveService";
import { slackService } from "./services/slackService";
import { googleSheetsService } from "./services/googleSheetsService";

// Helper function to get access token
async function getAccessToken(): Promise<string> {
  const token = await appStorage.getLatestAuthToken();
  
  if (!token) {
    throw new Error("Not authenticated");
  }
  
  // Check if token is expired
  if (new Date(token.expiresAt) <= new Date()) {
    throw new Error("Token expired, please login again");
  }
  
  return token.accessToken;
}

// Helper function to generate standardized filenames for scripts
function generateScriptFileName(index: number, title?: string): string {
  const baseNumber = `script${index + 1}`;
  
  if (!title || title.trim().length === 0) {
    return baseNumber;
  }
  
  // Create a slug from the title: lowercase, replace spaces/special chars with underscores, trim to max 50 chars
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
  
  return slug ? `${baseNumber}_${slug}` : baseNumber;
}

// Setup file upload middleware
const uploadDir = path.join(process.cwd(), "uploads");
// Create uploads directory if it doesn't exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const diskStorage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    // Create unique filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({
  storage: diskStorage,
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'video/mp4',
      'video/quicktime', // .mov
      'video/x-msvideo', // .avi
      'video/x-matroska' // .mkv
    ];
    const allowedExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
    
    const hasValidMimeType = allowedTypes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some(ext => 
      file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (hasValidMimeType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error("Only .mp4, .mov, .avi, and .mkv video files are allowed"));
    }
  },
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Helper function to validate batch integrity
async function validateBatchIntegrity(batchId: string) {
  const batch = await appStorage.getScriptBatchByBatchId(batchId);
  if (!batch) {
    return { valid: false, issues: ['Batch not found'] };
  }
  
  const scripts = await appStorage.getBatchScriptsByBatchId(batchId);
  const issues: string[] = [];
  
  // Check script count matches
  if (batch.scriptCount !== scripts.length) {
    issues.push(`Script count mismatch: expected ${batch.scriptCount}, found ${scripts.length}`);
  }
  
  // Check all scripts have content
  scripts.forEach((script, index) => {
    if (!script.content || script.content.trim() === '') {
      issues.push(`Script ${index} has no content`);
    }
    
    // Check script order is correct
    if (script.scriptIndex !== index) {
      issues.push(`Script order mismatch at index ${index}`);
    }
    
    // If video exists, audio should also exist
    if (script.videoUrl && !script.audioFile) {
      issues.push(`Script ${index} has video but no audio file`);
    }
  });
  
  return {
    valid: issues.length === 0,
    issues
  };
}

export async function registerRoutes(app: express.Express): Promise<Server> {
  
  // AI Script Generation endpoints - MUST be first to avoid static file conflicts
  // ElevenLabs voices endpoint
  app.get('/api/elevenlabs/voices', async (req, res) => {
    try {
      // Disable caching for this endpoint
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      const voices = await elevenLabsService.getVoices();
      
      // Add German language indicator to German voices
      const enhancedVoices = voices.map((voice: any) => {
        // Check if voice has German language label
        const isGerman = voice.labels?.language === 'de';
        
        // Add German flag to name if it's a German voice and doesn't already have the flag
        if (isGerman && !voice.name.includes('🇩🇪')) {
          return {
            ...voice,
            name: `${voice.name} 🇩🇪`,
            isGerman: true
          };
        }
        
        return {
          ...voice,
          isGerman
        };
      });
      
      res.json({ voices: enhancedVoices });
    } catch (error: any) {
      console.error('Error fetching voices:', error);
      res.status(500).json({ 
        error: 'Failed to fetch voices from ElevenLabs',
        details: error.message,
        configured: elevenLabsService.isConfigured()
      });
    }
  });

  // Get available LLM providers
  app.get('/api/ai/providers', async (req, res) => {
    try {
      const { getAvailableProviders } = await import('./services/llmService');
      const providers = getAvailableProviders();
      res.json({ providers });
    } catch (error) {
      console.error('Error fetching LLM providers:', error);
      res.status(500).json({ error: 'Failed to fetch LLM providers' });
    }
  });

  app.post('/api/ai/generate-scripts', async (req, res) => {
    try {
      console.log('AI script generation request received:', req.body);
      const { 
        spreadsheetId, 
        generateAudio = true, 
        scriptCount = 5, 
        backgroundVideoPath,
        backgroundVideoDriveId,
        backgroundVideoName,
        voiceId, 
        guidancePrompt, 
        language = 'en',
        slackEnabled = true,
        primerContent,
        experimentalPercentage = 50,
        individualGeneration = false,
        includeSubtitles = false,
        llmProvider = 'openai'
      } = req.body;
      
      if (!spreadsheetId) {
        return res.status(400).json({ message: 'Spreadsheet ID is required' });
      }

      // Validate guidancePrompt if provided
      if (guidancePrompt !== undefined && (typeof guidancePrompt !== 'string' || guidancePrompt.length > 5000)) {
        return res.status(400).json({ message: 'Guidance prompt must be a string with maximum 5000 characters' });
      }

      // Validate experimentalPercentage
      if (![0, 20, 40, 60, 80, 100].includes(experimentalPercentage)) {
        return res.status(400).json({ message: 'Experimental percentage must be 0, 20, 40, 60, 80, or 100' });
      }

      console.log(`Generating ${scriptCount} AI script suggestions with ${experimentalPercentage}% experimentation, audio: ${generateAudio}, mode: ${individualGeneration ? 'individual calls' : 'batch call'}`);
      
      // Generate unique batch ID
      const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      console.log(`Creating batch ${batchId} for ${scriptCount} scripts`);
      
      // Create batch record in database
      const batch = await appStorage.createScriptBatch({
        batchId,
        spreadsheetId,
        tabName: 'New Scripts',
        voiceId,
        guidancePrompt,
        backgroundVideoPath,
        scriptCount,
        status: 'generating'
      });
      
      const result = await aiScriptService.generateScriptSuggestions(
        spreadsheetId, 
        {
          includeVoice: generateAudio,
          scriptCount: scriptCount,
          voiceId: voiceId,
          guidancePrompt: guidancePrompt,
          language: language,
          primerContent: primerContent,
          experimentalPercentage: experimentalPercentage,
          individualGeneration: individualGeneration,
          llmProvider: llmProvider
        }
      );
      
      // Store all scripts in batch_scripts table with content hashes
      const batchScripts = await appStorage.createBatchScripts(
        result.suggestions.map((suggestion, index) => {
          // AUTOMATIC FAILSAFE: Compute content hash for integrity tracking
          const contentHash = crypto.createHash('sha256')
            .update(suggestion.content)
            .digest('hex');
          
          return {
            batchId,
            scriptIndex: index,
            title: suggestion.title,
            content: suggestion.content,
            contentHash, // Store hash for later verification
            reasoning: suggestion.reasoning,
            targetMetrics: suggestion.targetMetrics?.join(', '),
            fileName: suggestion.fileName || generateScriptFileName(index, suggestion.title),
            audioFile: suggestion.audioFile || null
          };
        })
      );
      
      console.log(`Stored ${batchScripts.length} scripts for batch ${batchId}`);

      // Auto-generate videos if audio was generated and background video is selected
      if (generateAudio && result.suggestions.some(s => s.audioFile)) {
        let selectedBackgroundVideo: string | null = null;
        
        // Download base film from Google Drive if driveId is provided
        if (backgroundVideoDriveId && backgroundVideoName) {
          console.log(`Downloading base film from Drive: ${backgroundVideoName} (${backgroundVideoDriveId})`);
          const downloadResult = await googleDriveService.downloadBaseFilmToTemp(backgroundVideoDriveId, backgroundVideoName);
          if (downloadResult.success && downloadResult.filePath) {
            selectedBackgroundVideo = downloadResult.filePath;
            console.log(`Base film downloaded to: ${selectedBackgroundVideo}`);
          } else {
            console.error('Failed to download base film from Drive:', downloadResult.error);
          }
        } else if (backgroundVideoPath && fs.existsSync(backgroundVideoPath)) {
          selectedBackgroundVideo = backgroundVideoPath;
        }
          
        if (selectedBackgroundVideo) {
          console.log(`Creating videos using background: ${selectedBackgroundVideo}`);
          
          try {
            const videosResult = await videoService.createVideosForScripts(
              result.suggestions,
              selectedBackgroundVideo,
              includeSubtitles
            );
            
            // Update batch scripts with video information
            for (let i = 0; i < videosResult.length; i++) {
              const videoResult = videosResult[i];
              if (videoResult && (videoResult.videoUrl || videoResult.videoFile)) {
                await appStorage.updateBatchScript(batchScripts[i].id, {
                  videoFile: videoResult.videoFile || null,
                  videoUrl: videoResult.videoUrl || null,
                  videoFileId: videoResult.videoFileId || null
                });
              }
            }
            
            // Merge video information with existing suggestions
            result.suggestions = result.suggestions.map((originalSuggestion, index) => {
              const videoResult = videosResult[index];
              return {
                ...originalSuggestion,
                videoFile: videoResult?.videoFile,
                videoUrl: videoResult?.videoUrl,
                videoFileId: videoResult?.videoFileId,
                videoError: videoResult?.videoError,
                folderLink: videoResult?.folderLink
              };
            });
            
            // Update batch record with folder link
            const folderLink = videosResult.find(v => v.folderLink)?.folderLink;
            if (folderLink) {
              await appStorage.updateScriptBatchStatus(batchId, 'videos_generated');
              await appStorage.updateScriptBatch(batchId, { folderLink });
            }
            
            console.log(`Created ${videosResult.filter(v => v.videoUrl).length} videos successfully for batch ${batchId}`);
          } catch (videoError) {
            console.error('Video creation failed:', videoError);
            // Continue without videos - don't fail the entire request
          }
        } else if (backgroundVideoDriveId && !selectedBackgroundVideo) {
          console.warn('Video generation skipped: failed to download base film from Google Drive');
        }
      }

      console.log(`Generated ${result.suggestions.length} suggestions`);

      // Save suggestions to "New Scripts" tab (with guidance prompt for ScriptDatabase)
      await aiScriptService.saveSuggestionsToSheet(spreadsheetId, result.suggestions, "New Scripts", guidancePrompt || "");

      // Debug: Check what's in the suggestions
      console.log('Checking suggestions for Slack notification:');
      result.suggestions.forEach((s, i) => {
        console.log(`  Suggestion ${i + 1}: videoUrl="${s.videoUrl}", videoFileId="${s.videoFileId}"`);
      });
      
      // Send immediate notification and schedule batch approval for later
      let slackScheduled = false;
      const hasVideosForSlack = result.suggestions.some(s => s.videoUrl);
      const slackDisabledByEnv = process.env.DISABLE_SLACK_NOTIFICATIONS === 'true';
      const slackDisabledByUser = !slackEnabled;
      const slackDisabled = slackDisabledByEnv || slackDisabledByUser;
      
      console.log(`Has videos for Slack: ${hasVideosForSlack}`);
      console.log(`Slack notifications disabled by env: ${slackDisabledByEnv}`);
      console.log(`Slack notifications disabled by user: ${slackDisabledByUser}`);
      
      if (hasVideosForSlack && !slackDisabled) {
        try {
          const timestamp = new Date().toLocaleString('en-CA', { 
            timeZone: 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).replace(',', '');

          const batchName = `Generated_${timestamp}`;
          const videoCount = result.suggestions.filter(s => s.videoUrl).length;
          
          // Find the Google Drive folder URL from the first video
          const driveFolder = result.suggestions.find(s => s.videoUrl)?.videoUrl || 'Google Drive folder';
          
          const batchData = {
            batchName,
            videoCount,
            scripts: result.suggestions.map((s, index) => ({ 
              title: s.title, 
              content: s.content,
              fileName: s.fileName || generateScriptFileName(index, s.title),
              videoUrl: s.videoUrl,
              videoFileId: s.videoFileId
            })),
            driveFolder,
            timestamp
          };

          // Send to Slack for approval with 5-minute delay for Google Drive processing
          console.log(`Video batch created: ${batchName}. Slack approval workflow will begin in 5 minutes (allowing Google Drive processing time)`);
          
          // Send immediate batch creation notification
          try {
            await slackService.sendMessage({
              channel: process.env.SLACK_CHANNEL_ID!,
              text: `Batch ${batchName} created with ${videoCount} videos. Approval workflow will begin in 5 minutes to allow Google Drive processing.`
            });
          } catch (error) {
            console.error('Error sending immediate notification:', error);
          }
          
          // Schedule approval workflow for 5 minutes later
          setTimeout(async () => {
            try {
              await slackService.sendVideoBatchForApproval(batchData);
              console.log(`Sent video batch to Slack for approval: ${batchName}`);
            } catch (slackError) {
              console.error('Failed to send Slack approval workflow:', slackError);
            }
          }, 5 * 60 * 1000); // 5 minutes in milliseconds

          slackScheduled = true;
        } catch (slackError) {
          console.error('Failed to send Slack notifications:', slackError);
          // Continue without failing the entire request
        }
      }

      const hasVideos = result.suggestions.some(s => s.videoUrl);
      const baseMessage = `Generated ${result.suggestions.length} script suggestions using Guidance Primer`;
      
      res.json({
        suggestions: result.suggestions,
        message: baseMessage,
        savedToSheet: true,
        voiceGenerated: result.voiceGenerated,
        slackScheduled
      });
    } catch (error) {
      console.error('Error generating AI script suggestions:', error);
      
      res.status(500).json({ 
        message: 'Failed to generate script suggestions', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Generate iterations of existing scripts
  app.post('/api/ai/generate-iterations', async (req, res) => {
    try {
      console.log('AI iteration generation request received:', req.body);
      const {
        sourceScripts,
        iterationsPerScript = 3,
        generateAudio = true,
        backgroundVideoPath,
        backgroundVideoDriveId,
        backgroundVideoName,
        voiceId,
        guidancePrompt,
        language = 'en',
        slackEnabled = true,
        primerContent,
        experimentalPercentage = 50,
        individualGeneration = false,
        spreadsheetId,
        includeSubtitles = false,
        llmProvider = 'openai'
      } = req.body;

      if (!sourceScripts || !Array.isArray(sourceScripts) || sourceScripts.length === 0) {
        return res.status(400).json({ message: 'Source scripts array is required' });
      }

      if (!spreadsheetId) {
        return res.status(400).json({ message: 'Spreadsheet ID is required' });
      }

      console.log(`Generating ${iterationsPerScript} iterations for ${sourceScripts.length} source scripts`);

      // Generate unique batch ID
      const batchId = `batch_iterations_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      console.log(`Creating iterations batch ${batchId}`);

      const totalIterations = sourceScripts.length * iterationsPerScript;

      // Create batch record in database
      const batch = await appStorage.createScriptBatch({
        batchId,
        spreadsheetId,
        tabName: 'Script Iterations',
        voiceId,
        guidancePrompt,
        backgroundVideoPath,
        scriptCount: totalIterations,
        status: 'generating'
      });

      // Generate iterations using AI script service
      const result = await aiScriptService.generateIterations(
        sourceScripts,
        {
          iterationsPerScript,
          includeVoice: generateAudio,
          voiceId: voiceId,
          guidancePrompt: guidancePrompt,
          language: language,
          primerContent: primerContent,
          experimentalPercentage: experimentalPercentage,
          individualGeneration: individualGeneration,
          llmProvider: llmProvider
        }
      );

      // Store all iterations in batch_scripts table
      const batchScripts = await appStorage.createBatchScripts(
        result.suggestions.map((suggestion, index) => {
          const contentHash = crypto.createHash('sha256')
            .update(suggestion.content)
            .digest('hex');

          return {
            batchId,
            scriptIndex: index,
            title: suggestion.title,
            content: suggestion.content,
            contentHash,
            reasoning: suggestion.reasoning,
            targetMetrics: suggestion.targetMetrics?.join(', '),
            fileName: suggestion.fileName || `iteration${index + 1}`,
            audioFile: suggestion.audioFile || null
          };
        })
      );

      console.log(`Stored ${batchScripts.length} iterations for batch ${batchId}`);

      // Auto-generate videos if audio was generated and background video is selected
      if (generateAudio && result.suggestions.some(s => s.audioFile)) {
        let selectedBackgroundVideo: string | null = null;
        
        // Download base film from Google Drive if driveId is provided
        if (backgroundVideoDriveId && backgroundVideoName) {
          console.log(`Downloading base film from Drive: ${backgroundVideoName} (${backgroundVideoDriveId})`);
          const downloadResult = await googleDriveService.downloadBaseFilmToTemp(backgroundVideoDriveId, backgroundVideoName);
          if (downloadResult.success && downloadResult.filePath) {
            selectedBackgroundVideo = downloadResult.filePath;
            console.log(`Base film downloaded to: ${selectedBackgroundVideo}`);
          } else {
            console.error('Failed to download base film from Drive:', downloadResult.error);
          }
        } else if (backgroundVideoPath && fs.existsSync(backgroundVideoPath)) {
          selectedBackgroundVideo = backgroundVideoPath;
        }

        if (selectedBackgroundVideo) {
          console.log(`Creating videos using background: ${selectedBackgroundVideo}`);

          try {
            const videosResult = await videoService.createVideosForScripts(
              result.suggestions,
              selectedBackgroundVideo,
              includeSubtitles
            );

            // Update batch scripts with video information
            for (let i = 0; i < videosResult.length; i++) {
              const videoResult = videosResult[i];
              if (videoResult && (videoResult.videoUrl || videoResult.videoFile)) {
                await appStorage.updateBatchScript(batchScripts[i].id, {
                  videoFile: videoResult.videoFile || null,
                  videoUrl: videoResult.videoUrl || null,
                  videoFileId: videoResult.videoFileId || null
                });
              }
            }

            // Merge video information
            result.suggestions = result.suggestions.map((originalSuggestion, index) => {
              const videoResult = videosResult[index];
              return {
                ...originalSuggestion,
                videoFile: videoResult?.videoFile,
                videoUrl: videoResult?.videoUrl,
                videoFileId: videoResult?.videoFileId,
                videoError: videoResult?.videoError,
                folderLink: videoResult?.folderLink
              };
            });

            // Update batch record with folder link
            const folderLink = videosResult.find(v => v.folderLink)?.folderLink;
            if (folderLink) {
              await appStorage.updateScriptBatchStatus(batchId, 'videos_generated');
              await appStorage.updateScriptBatch(batchId, { folderLink });
            }

            console.log(`Created ${videosResult.filter(v => v.videoUrl).length} videos successfully for batch ${batchId}`);
          } catch (videoError) {
            console.error('Video creation failed:', videoError);
          }
        } else if (backgroundVideoDriveId && !selectedBackgroundVideo) {
          console.warn('Video generation skipped: failed to download base film from Google Drive');
        }
      }

      // Save iterations to Google Sheets (with guidance prompt for ScriptDatabase)
      await aiScriptService.saveSuggestionsToSheet(spreadsheetId, result.suggestions, "Script Iterations", guidancePrompt || "");

      // Send to Slack if enabled
      let slackScheduled = false;
      const hasVideosForSlack = result.suggestions.some(s => s.videoUrl);
      const slackDisabledByEnv = process.env.DISABLE_SLACK_NOTIFICATIONS === 'true';
      const slackDisabledByUser = !slackEnabled;
      const slackDisabled = slackDisabledByEnv || slackDisabledByUser;

      if (hasVideosForSlack && !slackDisabled) {
        try {
          const timestamp = new Date().toLocaleString('en-CA', {
            timeZone: 'UTC',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).replace(',', '');

          const batchName = `Iterations_${timestamp}`;
          const videoCount = result.suggestions.filter(s => s.videoUrl).length;

          const batchData = {
            batchName,
            videoCount,
            scripts: result.suggestions.map((s, index) => ({
              title: s.title,
              content: s.content,
              fileName: s.fileName || `iteration${index + 1}`,
              videoUrl: s.videoUrl,
              videoFileId: s.videoFileId
            })),
            driveFolder: result.suggestions.find(s => s.videoUrl)?.videoUrl || 'Google Drive folder',
            timestamp
          };

          // Send immediate notification
          try {
            await slackService.sendMessage({
              channel: process.env.SLACK_CHANNEL_ID!,
              text: `Batch ${batchName} created with ${videoCount} iteration videos. Approval workflow will begin in 5 minutes.`
            });
          } catch (error) {
            console.error('Error sending immediate notification:', error);
          }

          // Schedule approval workflow
          setTimeout(async () => {
            try {
              await slackService.sendVideoBatchForApproval(batchData);
              console.log(`Sent iteration batch to Slack for approval: ${batchName}`);
            } catch (slackError) {
              console.error('Failed to send Slack approval workflow:', slackError);
            }
          }, 5 * 60 * 1000);

          slackScheduled = true;
        } catch (slackError) {
          console.error('Failed to send Slack notifications:', slackError);
        }
      }

      res.json({
        suggestions: result.suggestions,
        message: `Generated ${result.suggestions.length} iterations (${iterationsPerScript} per source script)`,
        savedToSheet: true,
        voiceGenerated: result.voiceGenerated,
        slackScheduled
      });
    } catch (error) {
      console.error('Error generating iterations:', error);

      res.status(500).json({
        message: 'Failed to generate iterations',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Slack webhook endpoint for handling button interactions
  app.post('/api/slack/interactions', express.urlencoded({ extended: true }), async (req, res) => {
    try {
      // Debug: Log what we receive
      console.log('[SLACK WEBHOOK] Raw body type:', typeof req.body);
      console.log('[SLACK WEBHOOK] Raw body keys:', req.body ? Object.keys(req.body) : 'none');
      
      // Handle different body parsing scenarios
      let payload;
      
      if (req.body && req.body.payload) {
        // Body was already parsed as URL-encoded object
        payload = JSON.parse(req.body.payload);
      } else if (Buffer.isBuffer(req.body)) {
        // Body is a buffer, parse as URL-encoded string
        const payloadString = req.body.toString();
        const urlParams = new URLSearchParams(payloadString);
        const payloadJson = urlParams.get('payload');
        if (!payloadJson) throw new Error('No payload found in buffer');
        payload = JSON.parse(payloadJson);
      } else if (typeof req.body === 'string') {
        // Body is a string, parse as URL-encoded
        const urlParams = new URLSearchParams(req.body);
        const payloadJson = urlParams.get('payload');
        if (!payloadJson) throw new Error('No payload found in string');
        payload = JSON.parse(payloadJson);
      } else {
        throw new Error(`Unexpected body type: ${typeof req.body}`);
      }
      
      if (payload.type === 'block_actions') {
        const action = payload.actions[0];
        const user = payload.user;
        const channel = payload.channel;
        const messageTs = payload.message.ts;
        
        // Parse action value: approve||${batchInfo.batchName}||${scriptNumber}||${script.videoFileId}
        const [actionType, batchName, scriptNumber, videoFileId] = action.value.split('||');
        
        console.log(`[SLACK INTERACTION] User ${user.name} clicked ${actionType.toUpperCase()} for script ${scriptNumber} in batch ${batchName}`);
        
        // Update the message to show the decision
        const isApproved = actionType === 'approve';
        const statusText = isApproved ? '✅ APPROVED' : '❌ REJECTED';
        const statusEmoji = isApproved ? '✅' : '❌';
        
        // CRITICAL: Respond to Slack immediately (within 3 seconds) to avoid 502 timeout
        res.json({
          response_type: 'in_channel',
          text: `${statusEmoji} Decision recorded for Ad ${scriptNumber}`
        });
        
        // Process the decision asynchronously in the background (don't await)
        setImmediate(async () => {
          try {
            // Update the button message to show the decision
            await slackService.updateMessageWithDecision(
              channel.id,
              messageTs,
              payload.message.blocks[0].text.text, // Keep original text
              statusText,
              user.name
            );
            
            // Record the decision for batch monitoring
            await slackService.recordDecision(batchName, scriptNumber, videoFileId, isApproved, messageTs);
            
            console.log(`[SLACK INTERACTION] Successfully processed ${actionType} for script ${scriptNumber}`);
          } catch (error) {
            console.error(`[SLACK INTERACTION] Error processing decision:`, error);
          }
        });
        
      } else {
        res.status(200).json({ message: 'Event received but not processed' });
      }
      
    } catch (error) {
      console.error('Error handling Slack interaction:', error);
      res.status(500).json({ error: 'Failed to process interaction' });
    }
  });

  // Auth routes
  app.get("/api/auth/status", async (req, res) => {
    try {
      const token = await appStorage.getLatestAuthToken();
      const isAuthenticated = !!token && new Date(token.expiresAt) > new Date();
      
      res.json({ authenticated: isAuthenticated });
    } catch (error) {
      console.error("Error checking auth status:", error);
      res.status(500).json({ message: "Failed to check authentication status" });
    }
  });

  app.get("/api/auth/login-url", (req, res) => {
    try {
      const loginUrl = metaApiService.getLoginUrl();
      res.json({ url: loginUrl });
    } catch (error) {
      console.error("Error generating login URL:", error);
      res.status(500).json({ message: "Failed to generate login URL" });
    }
  });

  app.get("/api/auth/callback", async (req, res) => {
    try {
      const { code } = req.query;
      
      if (typeof code !== "string") {
        return res.status(400).json({ message: "Invalid authorization code" });
      }
      
      const token = await metaApiService.exchangeCodeForToken(code);
      
      // Save token to database
      await appStorage.saveAuthToken({
        accessToken: token.access_token,
        refreshToken: token.refresh_token || null,
        expiresAt: new Date(Date.now() + token.expires_in * 1000),
      });
      
      // Log success
      await appStorage.createActivityLog({
        type: "success",
        message: "Connected to Meta Ads API",
        timestamp: new Date(),
      });
      
      // Close the popup window
      res.send(`
        <html>
          <body>
            <script>
              window.close();
            </script>
            <p>Authentication successful. You can close this window.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Auth callback error:", error);
      
      // Log error
      await appStorage.createActivityLog({
        type: "error",
        message: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
      
      res.status(500).send(`
        <html>
          <body>
            <script>
              window.close();
            </script>
            <p>Authentication failed. Please try again.</p>
          </body>
        </html>
      `);
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    try {
      // Clear token from database
      await appStorage.clearAuthTokens();
      
      res.json({ success: true });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Failed to logout" });
    }
  });

  // Campaign routes
  app.get("/api/campaigns", async (req, res) => {
    try {
      console.log("Fetching campaigns...");
      
      const token = await getAccessToken();
      console.log("Fetching campaigns from Meta API...");
      
      // Get campaigns from Meta API
      const campaigns = await metaApiService.getCampaigns(token);
      
      console.log(`Fetched ${campaigns.length} campaigns successfully`);
      
      // Save campaigns to database (for caching)
      for (const campaign of campaigns) {
        await appStorage.upsertCampaign(campaign);
      }
      
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      
      // Log error
      await appStorage.createActivityLog({
        type: "error",
        message: `Failed to fetch campaigns: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
      
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });
  
  // Test route for fetching pages
  app.get("/api/pages", async (req, res) => {
    try {
      console.log("Fetching pages...");
      
      const token = await getAccessToken();
      console.log("Fetching pages from Meta API...");
      
      // Get pages from Meta API
      const pages = await metaApiService.getPages(token);
      
      console.log(`Fetched ${pages.length} pages successfully`);
      
      res.json(pages);
    } catch (error) {
      console.error("Error fetching pages:", error);
      
      // Log error
      await appStorage.createActivityLog({
        type: "error",
        message: `Failed to fetch pages: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
      });
      
      res.status(500).json({ message: "Failed to fetch pages" });
    }
  });



  // Creative launch routes
  app.post("/api/creatives/launch", async (req, res) => {
    try {
      console.log("Starting creative launch process...");
      
      // Validate request body
      const schema = z.object({
        files: z.array(z.object({
          id: z.string(),
          path: z.string(),
          name: z.string(),
        })),
        campaignIds: z.array(z.string()),
      });
      
      const { files, campaignIds } = schema.parse(req.body);
      
      console.log(`Received request to launch ${files.length} files to ${campaignIds.length} campaigns`);
      console.log("Files:", JSON.stringify(files));
      console.log("Campaign IDs:", campaignIds);
      
      const accessToken = await getAccessToken();
      console.log("Authentication token valid, proceeding with creative launch");
      
      // Launch creatives
      const results = await Promise.allSettled(
        files.flatMap(file => 
          campaignIds.map(async (campaignId) => {
            console.log(`Processing file ID ${file.id} for campaign ${campaignId}`);
            
            let filePath = file.path;
            let fileName = file.name;
            
            // Handle Google Drive files - download temporarily for Meta upload
            if (file.path.startsWith('gdrive://')) {
              console.log(`File is from Google Drive: ${file.path}`);
              const googleDriveFileId = file.path.replace('gdrive://', '');
              
              console.log(`Downloading Google Drive file for Meta upload: ${fileName} (${googleDriveFileId})`);
              const downloadResult = await googleDriveService.downloadVideoFile(googleDriveFileId, fileName);
              
              if (!downloadResult.success || !downloadResult.filePath) {
                // Provide a helpful error message about permissions
                const errorMessage = downloadResult.error || 'Unknown error';
                if (errorMessage.includes('PERMISSION ISSUE')) {
                  throw new Error(`${errorMessage} - SOLUTION: Right-click each video file in Google Drive → Share → Add ${googleDriveService.getServiceAccountEmail()} as Editor`);
                }
                throw new Error(`Failed to download Google Drive file: ${errorMessage}`);
              }
              
              filePath = downloadResult.filePath;
              console.log(`Google Drive file downloaded to: ${filePath}`);
            }
            
            // Get file from database for local files
            let dbFile = null;
            if (!file.id.startsWith('gdrive-')) {
              dbFile = await appStorage.getFileById(parseInt(file.id));
              
              if (!dbFile) {
                console.error(`File with ID ${file.id} not found in database`);
                throw new Error(`File with ID ${file.id} not found`);
              }
              
              console.log(`Retrieved file from database: ${JSON.stringify(dbFile)}`);
              filePath = dbFile.path;
              fileName = dbFile.name;
            }
            
            try {
              // Use the new SDK-based approach for complete Meta upload pipeline
              console.log(`Starting complete Meta upload pipeline for "${fileName}" (${filePath}) to campaign ${campaignId}`);
              
              const result = await metaApiService.uploadAndCreateAdWithSDK(
                accessToken,
                campaignId,
                filePath,
                fileName
              );
              
              console.log(`Complete Meta upload successful: Video ${result.videoId} → Creative ${result.creativeId} → Ad ${result.adId}`);
              
              // For Google Drive files, we don't have a database entry, so we create a minimal creative record
              if (file.id.startsWith('gdrive-')) {
                // Log success for Google Drive files
                await appStorage.createActivityLog({
                  type: "success",
                  message: `Ad "${fileName}" (from Google Drive) launched to campaign "${campaignId}" - Ad ID: ${result.adId}`,
                  timestamp: new Date(),
                });
                console.log(`Created success activity log entry for Google Drive file`);
                
                return { id: result.adId, source: 'google-drive' };
              } else {
                // Handle regular database files
                if (!dbFile) {
                  throw new Error('Database file not found for non-Google Drive file');
                }
                
                // Update file with Meta asset ID
                await appStorage.updateFile(dbFile.id, {
                  metaAssetId: result.videoId,
                });
                console.log(`Updated file ${dbFile.id} with Meta asset ID ${result.videoId}`);
                
                // Save creative to database
                const creative = await appStorage.createCreative({
                  fileId: dbFile.id,
                  campaignId,
                  metaCreativeId: result.creativeId,
                  status: "completed",
                });
                console.log(`Saved creative to database with ID: ${creative.id}`);
                
                // Update file status
                await appStorage.updateFile(dbFile.id, {
                  status: "completed",
                });
                console.log(`Updated file status to "completed"`);
                
                // Log success
                await appStorage.createActivityLog({
                  type: "success",
                  message: `Ad "${dbFile.name}" launched to campaign "${campaignId}" - Ad ID: ${result.adId}`,
                  timestamp: new Date(),
                });
                console.log(`Created success activity log entry`);
                
                return creative;
              }
            } catch (error) {
              const fileIdentifier = dbFile ? dbFile.id : file.id;
              console.error(`Error processing file ${fileIdentifier} for campaign ${campaignId}:`, error);
              throw error; // Re-throw to be caught by Promise.allSettled
            }
          })
        )
      );
      
      // Count successes and errors
      const successCount = results.filter(r => r.status === "fulfilled").length;
      const errorCount = results.filter(r => r.status === "rejected").length;
      
      console.log(`Processed all files: ${successCount} successes, ${errorCount} errors`);
      
      // Extract created creative IDs and errors
      const creativeIds = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map(r => r.value.id.toString());
      
      const errors = results
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map(r => r.reason);
      
      const errorMessages = errors.map(e => e instanceof Error ? e.message : String(e));
      console.log(`Error messages:`, errorMessages);
      
      res.json({
        successCount,
        errorCount,
        creativeIds,
        errors: errorMessages,
      });
    } catch (error) {
      console.error("Creative launch error:", error);
      
      // Handle validation errors
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        console.log(`Validation error: ${validationError.message}`);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Log error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await appStorage.createActivityLog({
        type: "error",
        message: `Failed to launch creatives: ${errorMessage}`,
        timestamp: new Date(),
      });
      console.log(`Created error activity log entry: ${errorMessage}`);
      
      res.status(500).json({ message: "Failed to launch creatives" });
    }
  });

  // Performance report routes
  app.post("/api/reports/generate", async (req, res) => {
    try {
      const schema = z.object({
        dateRange: z.object({
          since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        }).optional(),
        campaignIds: z.array(z.string()).optional(),
        spreadsheetId: z.string().optional(),
        metrics: z.array(z.string()).optional(),
      });

      const { dateRange, campaignIds, spreadsheetId, metrics } = schema.parse(req.body);
      
      const accessToken = await getAccessToken();
      
      console.log(`Generating performance report${dateRange ? ` for ${dateRange.since} to ${dateRange.until}` : ' for all available data'}`);
      
      const result = await performanceReportService.generateReport(accessToken, {
        dateRange,
        campaignIds,
        spreadsheetId,
        metrics,
      });

      // Log success
      await appStorage.createActivityLog({
        type: "success",
        message: `Performance report generated: ${result.dataExported} records exported to Google Sheets`,
        timestamp: new Date(),
      });

      res.json(result);
    } catch (error) {
      console.error("Error generating performance report:", error);
      
      // Handle validation errors
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      // Log error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await appStorage.createActivityLog({
        type: "error",
        message: `Failed to generate performance report: ${errorMessage}`,
        timestamp: new Date(),
      });
      
      res.status(500).json({ message: "Failed to generate performance report" });
    }
  });

  app.get("/api/reports/date-presets", (_req, res) => {
    try {
      const presets = performanceReportService.getDateRangePresets();
      res.json(presets);
    } catch (error) {
      console.error("Error getting date presets:", error);
      res.status(500).json({ message: "Failed to get date presets" });
    }
  });

  app.get("/api/insights", async (req, res) => {
    try {
      const schema = z.object({
        since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        campaignIds: z.string().optional(),
      });

      const { since, until, campaignIds } = schema.parse(req.query);
      
      const accessToken = await getAccessToken();
      
      let insights;
      if (campaignIds) {
        const campaignIdArray = campaignIds.split(',');
        insights = await metaApiService.getCampaignInsights(accessToken, campaignIdArray, { since, until });
      } else {
        insights = await metaApiService.getAdAccountInsights(accessToken, { since, until });
      }

      res.json(insights);
    } catch (error) {
      console.error("Error fetching insights:", error);
      
      if (error instanceof ZodError) {
        const validationError = fromZodError(error);
        return res.status(400).json({ message: validationError.message });
      }
      
      res.status(500).json({ message: "Failed to fetch campaign insights" });
    }
  });

  // Slack integration routes - DISABLED FOR TESTING
  app.post("/api/slack/test", async (req, res) => {
    // ALL SLACK MESSAGING DISABLED FOR TESTING
    console.log('[SLACK DISABLED] Test message request ignored - all Slack messaging disabled');
    res.status(200).json({
      success: false,
      message: 'Slack messaging is currently disabled for testing',
      disabled: true
    });
    
    /* Original implementation - commented out for testing
    try {
      const { message } = req.body;
      
      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      const messageTs = await slackService.sendNotification(message);
      
      res.json({ 
        success: true, 
        message: "Slack message sent successfully",
        messageTs 
      });
    } catch (error) {
      console.error("Error sending Slack message:", error);
      res.status(500).json({ 
        message: "Failed to send Slack message", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
    */
  });

  // Google Drive test endpoint
  app.get('/api/drive/test', async (req, res) => {
    try {
      const { googleDriveService } = await import('./services/googleDriveService');
      
      if (!googleDriveService.isConfigured()) {
        return res.status(500).json({ 
          success: false, 
          error: 'Google Drive service is not configured' 
        });
      }

      // Test creating a timestamped subfolder
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19);
      const testFolderId = await googleDriveService.createTimestampedSubfolder(
        '1AIe9UvmYnBJiJyD1rMzLZRNqKDw-BWJh',
        `test_${timestamp}`
      );

      res.json({ 
        success: true, 
        message: 'Google Drive test successful',
        folderId: testFolderId,
        folderLink: `https://drive.google.com/drive/folders/${testFolderId}`
      });
    } catch (error) {
      console.error('Google Drive test failed:', error);
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  app.post("/api/slack/check-batch", async (req, res) => {
    try {
      const { batchName, messageTimestamps, totalAds } = req.body;
      
      if (!batchName || !messageTimestamps || !totalAds) {
        return res.status(400).json({ message: "batchName, messageTimestamps, and totalAds are required" });
      }

      await slackService.checkBatchCompletion(batchName, messageTimestamps, totalAds);
      
      res.json({ 
        success: true, 
        message: "Batch completion check performed"
      });
    } catch (error) {
      console.error("Error checking batch completion:", error);
      res.status(500).json({ 
        message: "Failed to check batch completion", 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Activity log routes
  app.get("/api/logs", async (_req, res) => {
    try {
      const logs = await appStorage.getActivityLogs();
      res.json(logs);
    } catch (error) {
      console.error("Error fetching logs:", error);
      res.status(500).json({ message: "Failed to fetch activity logs" });
    }
  });
  
  // Check Meta API setup (including page connections)
  app.get("/api/meta/status", async (_req, res) => {
    try {
      try {
        const token = await getAccessToken();
        
        // Check if ad account exists
        let adAccountId = process.env.META_AD_ACCOUNT_ID;
        const hasAdAccount = !!adAccountId;
        
        // Check if pages exist
        const pages = await metaApiService.getPages(token);
        const hasPages = pages.length > 0;
        // Check if using the real page provided by the user (ID: 118677978328614)
        const isRealPage = pages.length > 0 && pages[0].id === "118677978328614";
        
        // Check if campaigns exist
        const campaigns = await metaApiService.getCampaigns(token);
        const hasCampaigns = campaigns.length > 0;
        
        // Determine status
        let status = "ready";
        let message = "Meta API is properly configured";
        
        if (!hasAdAccount) {
          status = "missing_ad_account";
          message = "No ad account connected";
        } else if (!isRealPage) {
          status = "missing_page";
          message = "No Facebook Page connected to your ad account. Using a test page which may not work in production.";
        } else if (!hasCampaigns) {
          status = "missing_campaigns";
          message = "No campaigns found in your ad account";
        }
        
        res.json({
          authenticated: true,
          adAccount: hasAdAccount,
          pages: hasPages,
          realPage: isRealPage,
          campaigns: hasCampaigns,
          status,
          message
        });
      } catch (error) {
        // If error is about authentication, return structured response
        if (error instanceof Error && 
            (error.message.includes("Not authenticated") || 
             error.message.includes("Token expired"))) {
          return res.json({
            authenticated: false,
            adAccount: false,
            pages: false,
            campaigns: false,
            status: "not_authenticated",
            message: error.message
          });
        }
        
        // Otherwise, re-throw for general error handling
        throw error;
      }
    } catch (error) {
      console.error("Error checking Meta status:", error);
      res.status(500).json({ 
        authenticated: false,
        status: "error",
        message: "Failed to check Meta API status" 
      });
    }
  });



  // AI Script Generation endpoints
  app.post('/api/ai-scripts/generate', async (req, res) => {
    try {
      const { spreadsheetId, voiceId, includeVoice = false, llmProvider = 'openai' } = req.body;

      if (!spreadsheetId) {
        return res.status(400).json({ error: 'Spreadsheet ID is required' });
      }

      const result = await aiScriptService.generateScriptSuggestions(spreadsheetId, {
        voiceId,
        includeVoice,
        llmProvider
      });
      res.json(result);
    } catch (error: any) {
      console.error('Error generating AI scripts:', error);
      res.status(500).json({ 
        error: 'Failed to generate AI scripts',
        details: error.message 
      });
    }
  });

  // Unified workflow endpoint
  app.post('/api/unified/generate', async (req, res) => {
    try {
      const { dateRange, campaignIds, spreadsheetId, llmProvider = 'openai' } = req.body;

      if (!spreadsheetId) {
        return res.status(400).json({ error: 'Spreadsheet ID is required' });
      }

      // Generate performance report first
      const reportResult = await performanceReportService.generateReport(
        await getAccessToken(),
        {
          dateRange,
          campaignIds,
          spreadsheetId: spreadsheetId.trim()
        }
      );

      // Generate AI scripts with voice
      const aiResult = await aiScriptService.generateScriptSuggestions(spreadsheetId, {
        includeVoice: true, // Always include voice in unified workflow
        llmProvider
      });
      
      return res.json({
        reportResult: reportResult,
        scriptResult: aiResult
      });
    } catch (error: any) {
      console.error('Error in unified generation:', error);
      res.status(500).json({ 
        error: 'Failed to generate unified report and scripts',
        details: error.message 
      });
    }
  });

  // Get available Google Sheets tabs
  app.get('/api/google-sheets/tabs', async (req, res) => {
    try {
      const { spreadsheetId } = req.query;
      
      if (!spreadsheetId || typeof spreadsheetId !== 'string') {
        return res.status(400).json({ error: 'Spreadsheet ID is required' });
      }

      const tabs = await googleSheetsService.getAvailableTabs(spreadsheetId);
      res.json({ tabs });
    } catch (error: any) {
      console.error('Error getting Google Sheets tabs:', error);
      res.status(500).json({ 
        error: 'Failed to get tabs from Google Sheets',
        details: error.message 
      });
    }
  });

  // Read scripts from a specific Google Sheets tab
  app.post('/api/google-sheets/read-scripts', async (req, res) => {
    try {
      const { spreadsheetId, tabName } = req.body;
      
      if (!spreadsheetId || !tabName) {
        return res.status(400).json({ error: 'Spreadsheet ID and tab name are required' });
      }

      const scripts = await googleSheetsService.readScriptsFromTab(spreadsheetId, tabName);
      res.json({ scripts });
    } catch (error: any) {
      console.error('Error reading scripts from Google Sheets:', error);
      res.status(500).json({ 
        error: 'Failed to read scripts from Google Sheets',
        details: error.message 
      });
    }
  });

  // Process existing scripts into videos and send to Slack
  app.post('/api/scripts/process-to-videos', async (req, res) => {
    try {
      const { 
        scripts, 
        voiceId, 
        language = 'en',
        backgroundVideos: selectedBackgroundVideos = [],
        backgroundVideosDrive = [],
        sendToSlack,
        slackNotificationDelay = 0,
        includeSubtitles = false
      } = req.body;
      
      if (!scripts || !Array.isArray(scripts)) {
        return res.status(400).json({ error: 'Scripts array is required' });
      }

      console.log(`Processing ${scripts.length} existing scripts into videos with ${backgroundVideosDrive.length || selectedBackgroundVideos.length} background videos`);

      // Transform the scripts from Google Sheets format to the format expected by our services
      const formattedScripts = scripts.map((script, index) => ({
        title: script.scriptTitle,
        content: script.content || script.nativeContent, // Use English content if available, otherwise native
        nativeContent: script.nativeContent,
        language: script.recordingLanguage === 'English' ? 'en' : language,
        reasoning: script.reasoning,
        notableAdjustments: script.translationNotes,
        fileName: generateScriptFileName(index, script.scriptTitle)
      }));

      // Generate audio for the scripts (once per script)
      const voiceIdToUse = voiceId || 'huvDR9lwwSKC0zEjZUox'; // Default to Ella AI
      const scriptsWithAudio = await elevenLabsService.generateScriptVoiceovers(
        formattedScripts,
        voiceIdToUse
      );

      console.log(`Generated audio for ${scriptsWithAudio.length} scripts`);

      // Generate videos for each script with each selected background video
      let allScriptsWithVideos: any[] = [];
      
      // Build list of background video paths - download from Drive if needed
      let videosToUse: string[] = [];
      
      if (backgroundVideosDrive && backgroundVideosDrive.length > 0) {
        // Download each base film from Google Drive
        for (const driveVideo of backgroundVideosDrive) {
          if (driveVideo.driveId && driveVideo.name) {
            console.log(`Downloading base film from Drive: ${driveVideo.name} (${driveVideo.driveId})`);
            const downloadResult = await googleDriveService.downloadBaseFilmToTemp(driveVideo.driveId, driveVideo.name);
            if (downloadResult.success && downloadResult.filePath) {
              videosToUse.push(downloadResult.filePath);
              console.log(`Base film downloaded to: ${downloadResult.filePath}`);
            } else {
              console.error(`Failed to download base film ${driveVideo.name}:`, downloadResult.error);
            }
          }
        }
      } else if (selectedBackgroundVideos && selectedBackgroundVideos.length > 0) {
        // Use local paths (legacy support)
        videosToUse = selectedBackgroundVideos;
      }
      
      if (videosToUse.length > 0) {
        for (const bgVideo of videosToUse) {
          try {
            // Get just the filename for the video suffix
            const bgVideoName = path.basename(bgVideo, path.extname(bgVideo)).replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
            
            // Create scripts with video-specific filenames (using formattedScripts for base fileName)
            const scriptsForThisVideo = scriptsWithAudio.map((script, idx) => ({
              ...script,
              fileName: `${formattedScripts[idx].fileName}_${bgVideoName}`
            }));
            
            const scriptsWithVideos = await videoService.createVideosForScripts(
              scriptsForThisVideo,
              bgVideo,
              includeSubtitles
            );
            
            // Add the background video name to each result for reference
            const scriptsWithBgInfo = scriptsWithVideos.map(s => ({
              ...s,
              backgroundVideoName: path.basename(bgVideo)
            }));
            
            allScriptsWithVideos.push(...scriptsWithBgInfo);
            console.log(`Created ${scriptsWithVideos.filter(s => s.videoUrl).length} videos with background: ${path.basename(bgVideo)}`);
          } catch (videoError) {
            console.error(`Video creation failed for ${bgVideo}:`, videoError);
          }
        }
      } else {
        // No videos to use, just keep the audio scripts
        allScriptsWithVideos = scriptsWithAudio;
      }
      
      let scriptsWithVideos = allScriptsWithVideos;

      // Send to Slack if requested
      if (sendToSlack) {
        const timestamp = new Date().toISOString();
        const batchName = `processed_batch_${Date.now()}`;
        
        // Upload videos to Google Drive first
        const parentFolderId = '1AIe9UvmYnBJiJyD1rMzLZRNqKDw-BWJh'; // AI Generated Videos folder
        const driveFolderId = await googleDriveService.createTimestampedSubfolder(parentFolderId);
        const driveFolderLink = `https://drive.google.com/drive/folders/${driveFolderId}`;
        const driveFolder = { id: driveFolderId, webViewLink: driveFolderLink };
        
        // Upload each video to Drive
        const scriptsWithDriveLinks = await Promise.all(scriptsWithVideos.map(async (script) => {
          if (script.videoFile) {
            try {
              const uploadResult = await googleDriveService.uploadVideoToSpecificFolder(
                script.videoFile,
                `${script.fileName}.mp4`,
                driveFolder.id
              );
              return {
                ...script,
                videoUrl: uploadResult.webViewLink,
                videoFileId: uploadResult.id
              };
            } catch (uploadError) {
              console.error(`Failed to upload video for ${script.title}:`, uploadError);
              return script;
            }
          }
          return script;
        }));

        // Handle Slack notification with optional delay
        if (slackNotificationDelay > 0) {
          // Send immediate notification about batch creation
          await slackService.sendBatchCreationNotification(
            batchName,
            scriptsWithDriveLinks.length,
            slackNotificationDelay
          );
          
          // Schedule the actual batch approval messages
          setTimeout(async () => {
            await slackService.sendVideoBatchForApproval({
              batchName,
              videoCount: scriptsWithDriveLinks.length,
              scripts: scriptsWithDriveLinks,
              driveFolder: driveFolder.webViewLink,
              timestamp
            });
          }, slackNotificationDelay * 60 * 1000);
        } else {
          // Send immediately
          await slackService.sendVideoBatchForApproval({
            batchName,
            videoCount: scriptsWithDriveLinks.length,
            scripts: scriptsWithDriveLinks,
            driveFolder: driveFolder.webViewLink,
            timestamp
          });
        }

        res.json({
          success: true,
          processedCount: scriptsWithVideos.length,
          videosGenerated: scriptsWithVideos.filter(s => s.videoUrl).length,
          sentToSlack: true,
          driveFolder: driveFolder.webViewLink,
          message: `Processed ${scriptsWithVideos.length} scripts successfully`
        });
      } else {
        res.json({
          success: true,
          processedCount: scriptsWithVideos.length,
          videosGenerated: scriptsWithVideos.filter(s => s.videoUrl).length,
          scripts: scriptsWithVideos,
          message: `Processed ${scriptsWithVideos.length} scripts successfully`
        });
      }
    } catch (error: any) {
      console.error('Error processing scripts to videos:', error);
      res.status(500).json({ 
        error: 'Failed to process scripts to videos',
        details: error.message 
      });
    }
  });

  // Audio generation for selected scripts only
  app.post('/api/ai/generate-audio-only', async (req, res) => {
    try {
      console.log('Audio-only generation request received:', req.body);
      const { suggestions, indices } = req.body;
      
      if (!suggestions || !Array.isArray(suggestions)) {
        return res.status(400).json({ message: 'Suggestions array is required' });
      }

      console.log(`Generating audio for ${suggestions.length} selected scripts`);
      
      // Generate audio using ElevenLabs for the selected suggestions
      const suggestionsWithAudio = await elevenLabsService.generateScriptVoiceovers(
        suggestions,
        'huvDR9lwwSKC0zEjZUox' // Ella AI voice ID
      );

      console.log(`Generated audio for ${suggestionsWithAudio.length} suggestions`);

      // Auto-generate videos if audio was generated and background videos are available
      const backgroundVideos = videoService.getAvailableBackgroundVideos();
      if (backgroundVideos.length > 0) {
        console.log(`Creating videos for selected scripts using background: ${backgroundVideos[0]}`);
        
        try {
          const videosResult = await videoService.createVideosForScripts(
            suggestionsWithAudio,
            backgroundVideos[0], // Use first available background video
            false // No subtitles for audio-only generation
          );
          
          console.log(`Created ${videosResult.filter(v => v.videoUrl).length} videos successfully`);
          
          // Return the results with video information
          res.json({
            suggestions: videosResult,
            message: `Generated audio and videos for ${videosResult.length} script${videosResult.length !== 1 ? 's' : ''}`,
            voiceGenerated: true,
            videosGenerated: true
          });
          return;
        } catch (videoError) {
          console.error('Video creation failed:', videoError);
          // Continue with just audio if video creation fails
        }
      }

      res.json({
        suggestions: suggestionsWithAudio,
        message: `Generated audio for ${suggestionsWithAudio.length} script${suggestionsWithAudio.length !== 1 ? 's' : ''}`,
        voiceGenerated: true
      });
    } catch (error) {
      console.error('Error generating audio for selected scripts:', error);
      
      res.status(500).json({ 
        message: 'Failed to generate audio for selected scripts', 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Video service endpoints
  app.get('/api/video/status', async (req, res) => {
    try {
      const ffmpegAvailable = await videoService.checkFfmpegAvailability();
      const driveConfigured = googleDriveService.isConfigured();
      
      // Get base films from Google Drive
      let backgroundVideosCount = 0;
      let backgroundVideos: any[] = [];
      
      if (driveConfigured) {
        try {
          const baseFilmsFolderId = process.env.BASE_FILMS_FOLDER_ID || '1AIe9UvmYnBJiJyD1rMzLZRNqKDw-BWJh';
          const driveVideos = await googleDriveService.listBaseFilms(baseFilmsFolderId);
          backgroundVideosCount = driveVideos.length;
          backgroundVideos = driveVideos.map(video => ({
            id: video.id,
            name: video.name,
            size: video.size,
            driveId: video.id
          }));
        } catch (driveError) {
          console.warn('Failed to list base films from Drive:', driveError);
        }
      }
      
      res.json({
        ffmpegAvailable,
        backgroundVideosCount,
        backgroundVideos,
        driveConfigured,
        source: 'google_drive',
        message: ffmpegAvailable 
          ? `Video service ready with ${backgroundVideosCount} base film${backgroundVideosCount !== 1 ? 's' : ''} from Google Drive`
          : 'FFmpeg not available - video creation disabled'
      });
    } catch (error: any) {
      console.error('Error checking video service status:', error);
      res.status(500).json({
        ffmpegAvailable: false,
        driveConfigured: false,
        error: 'Failed to check video service status',
        details: error.message
      });
    }
  });

  // Get available background videos from Google Drive
  app.get("/api/video/background-videos", async (req, res) => {
    try {
      // Base films folder ID in Google Drive - can be set via env var
      const baseFilmsFolderId = process.env.BASE_FILMS_FOLDER_ID || '1AIe9UvmYnBJiJyD1rMzLZRNqKDw-BWJh';
      
      if (!googleDriveService.isConfigured()) {
        return res.status(503).json({ 
          error: 'Google Drive not configured',
          videos: []
        });
      }
      
      const driveVideos = await googleDriveService.listBaseFilms(baseFilmsFolderId);
      
      res.json({
        source: 'google_drive',
        folderId: baseFilmsFolderId,
        videos: driveVideos.map(video => ({
          id: video.id,
          name: video.name,
          size: video.size,
          driveId: video.id
        }))
      });
    } catch (error) {
      console.error('Error getting background videos from Drive:', error);
      res.status(500).json({ error: 'Failed to get background videos from Google Drive' });
    }
  });

  // Download a base film from Google Drive for video processing
  app.post("/api/video/download-base-film", async (req, res) => {
    try {
      const { driveId, fileName } = req.body;
      
      if (!driveId || !fileName) {
        return res.status(400).json({ error: 'driveId and fileName are required' });
      }
      
      if (!googleDriveService.isConfigured()) {
        return res.status(503).json({ error: 'Google Drive not configured' });
      }
      
      const result = await googleDriveService.downloadBaseFilmToTemp(driveId, fileName);
      
      if (result.success) {
        res.json({ 
          success: true, 
          localPath: result.filePath 
        });
      } else {
        res.status(500).json({ 
          success: false, 
          error: result.error 
        });
      }
    } catch (error) {
      console.error('Error downloading base film:', error);
      res.status(500).json({ error: 'Failed to download base film' });
    }
  });

  app.post('/api/video/upload-background', upload.array('videos', 20), async (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({ message: 'No video files uploaded' });
      }
      
      const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv'];
      const backgroundsDir = path.join(process.cwd(), 'uploads', 'backgrounds');
      if (!fs.existsSync(backgroundsDir)) {
        fs.mkdirSync(backgroundsDir, { recursive: true });
      }
      
      const uploadedFiles = [];
      const failedFiles = [];
      
      for (const file of files) {
        try {
          const isValidVideo = videoExtensions.some(ext => 
            file.originalname.toLowerCase().endsWith(ext)
          );
          
          if (!isValidVideo) {
            failedFiles.push({
              filename: file.originalname,
              reason: 'Invalid file type (only .mp4, .mov, .avi, .mkv allowed)'
            });
            fs.unlinkSync(file.path);
            continue;
          }
          
          // Move file to backgrounds directory
          const newPath = path.join(backgroundsDir, file.originalname);
          
          // If file already exists, skip
          if (fs.existsSync(newPath)) {
            uploadedFiles.push({
              filename: file.originalname,
              path: newPath,
              status: 'already_exists'
            });
            fs.unlinkSync(file.path);
            continue;
          }
          
          fs.renameSync(file.path, newPath);
          
          uploadedFiles.push({
            filename: file.originalname,
            path: newPath,
            status: 'uploaded'
          });
        } catch (fileError) {
          failedFiles.push({
            filename: file.originalname,
            reason: fileError instanceof Error ? fileError.message : 'Unknown error'
          });
        }
      }
      
      res.json({
        message: `Uploaded ${uploadedFiles.filter(f => f.status === 'uploaded').length} video(s) successfully`,
        uploaded: uploadedFiles,
        failed: failedFiles,
        totalCount: files.length,
        successCount: uploadedFiles.length,
        failedCount: failedFiles.length
      });
    } catch (error) {
      console.error('Background video upload error:', error);
      res.status(500).json({ message: 'Failed to upload background videos' });
    }
  });

  // Google Drive video endpoints
  app.get('/api/drive/videos', async (req, res) => {
    try {
      if (!googleDriveService.isConfigured()) {
        return res.status(400).json({
          error: 'Google Drive not configured',
          message: 'Please configure Google Drive service account'
        });
      }

      const { search } = req.query;
      let videos;

      if (search && typeof search === 'string') {
        videos = await googleDriveService.searchVideoFiles(search);
      } else {
        videos = await googleDriveService.listVideoFiles();
      }

      // Format the response with additional info
      const formattedVideos = videos.map(video => ({
        ...video,
        formattedSize: video.size ? googleDriveService.formatFileSize(video.size) : 'Unknown',
        isVideo: video.mimeType?.includes('video/') || false
      }));

      res.json({
        videos: formattedVideos,
        count: formattedVideos.length,
        message: `Found ${formattedVideos.length} video${formattedVideos.length !== 1 ? 's' : ''} in Google Drive`
      });
    } catch (error: any) {
      console.error('Error listing Google Drive videos:', error);
      res.status(500).json({
        error: 'Failed to list Google Drive videos',
        details: error.message
      });
    }
  });

  app.post('/api/drive/download', async (req, res) => {
    try {
      if (!googleDriveService.isConfigured()) {
        return res.status(400).json({
          error: 'Google Drive not configured'
        });
      }

      const { fileId, fileName } = req.body;

      if (!fileId || !fileName) {
        return res.status(400).json({
          error: 'File ID and name are required'
        });
      }

      console.log(`Downloading video from Google Drive: ${fileName} (${fileId})`);

      const result = await googleDriveService.downloadVideoFile(fileId, fileName);

      if (result.success) {
        res.json({
          success: true,
          message: `Video "${fileName}" downloaded successfully`,
          fileName
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Failed to download video'
        });
      }
    } catch (error: any) {
      console.error('Error downloading video from Google Drive:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to download video from Google Drive',
        details: error.message
      });
    }
  });

  // List videos from specific Google Drive folder (AI-generated videos)
  app.get("/api/drive/folder/:folderId/videos", async (req, res) => {
    try {
      const { folderId } = req.params;
      
      if (!folderId) {
        return res.status(400).json({ message: "Folder ID is required" });
      }
      
      console.log(`Listing videos from Google Drive folder: ${folderId}`);
      const videos = await googleDriveService.listVideosFromFolder(folderId);
      
      res.json({ 
        success: true, 
        videos: videos.map(video => ({
          id: `gdrive-${video.id}`, // Prefix to distinguish from local files
          name: video.name,
          size: parseInt(video.size || '0'),
          type: 'video/mp4',
          status: 'ready',
          path: `gdrive://${video.id}`, // Special path to indicate Google Drive file
          createdAt: video.modifiedTime || new Date().toISOString(),
          webViewLink: video.webViewLink,
          source: 'google-drive'
        }))
      });
    } catch (error) {
      console.error("Error listing videos from Google Drive folder:", error);
      res.status(500).json({ 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get batch folders from a specific Google Drive folder
  app.get('/api/drive/folder/:folderId/batch-folders', async (req, res) => {
    try {
      const { folderId } = req.params;
      
      if (!googleDriveService.isConfigured()) {
        return res.status(503).json({
          error: 'Google Drive service not configured',
          folders: []
        });
      }

      const folders = await googleDriveService.listBatchFoldersFromFolder(folderId);
      res.json({ folders });
    } catch (error: any) {
      console.error('Error listing batch folders from Google Drive:', error);
      res.status(500).json({
        error: 'Failed to list batch folders from Google Drive',
        folders: []
      });
    }
  });

  app.get('/api/drive/status', async (req, res) => {
    try {
      if (!googleDriveService.isConfigured()) {
        return res.json({
          configured: false,
          message: 'Google Drive service account not configured'
        });
      }

      const storageInfo = await googleDriveService.getStorageInfo();
      const serviceAccountEmail = googleDriveService.getServiceAccountEmail();
      
      res.json({
        configured: true,
        storageInfo,
        serviceAccountEmail,
        message: 'Google Drive access configured'
      });
    } catch (error: any) {
      console.error('Error checking Google Drive status:', error);
      res.status(500).json({
        configured: false,
        error: 'Failed to check Google Drive status',
        details: error.message
      });
    }
  });

  // ElevenLabs voice endpoints
  app.get('/api/elevenlabs/status', async (req, res) => {
    try {
      if (!process.env.ELEVENLABS_API_KEY) {
        return res.json({ 
          configured: false, 
          message: 'ElevenLabs API key not configured' 
        });
      }

      const accountInfo = await elevenLabsService.getAccountInfo();
      res.json({ 
        configured: true, 
        account: accountInfo,
        message: 'ElevenLabs is configured and ready' 
      });
    } catch (error: any) {
      console.error('Error checking ElevenLabs status:', error);
      res.status(500).json({ 
        configured: false,
        error: 'Failed to check ElevenLabs status',
        details: error.message 
      });
    }
  });

  app.post('/api/elevenlabs/generate', async (req, res) => {
    try {
      const { text, voiceId, options = {} } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const audioBuffer = await elevenLabsService.generateSpeech(text, voiceId, options);
      const filename = `voice_${Date.now()}`;
      const filePath = await elevenLabsService.saveAudioToFile(audioBuffer, filename);
      const audioUrl = `/uploads/${path.basename(filePath)}`;

      res.json({
        audioUrl,
        filename: path.basename(filePath),
        message: 'Voice generated successfully'
      });
    } catch (error: any) {
      console.error('Error generating voice:', error);
      res.status(500).json({ 
        error: 'Failed to generate voice',
        details: error.message 
      });
    }
  });

  // Validate batch integrity
  app.get('/api/batches/:batchId/validate', async (req, res) => {
    try {
      const { batchId } = req.params;
      
      const batch = await appStorage.getScriptBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ error: 'Batch not found' });
      }
      
      const scripts = await appStorage.getBatchScriptsByBatchId(batchId);
      
      // Validation checks
      const issues: string[] = [];
      const validationResults = {
        batchId,
        scriptCount: batch.scriptCount,
        actualScriptCount: scripts.length,
        scriptsWithAudio: scripts.filter(s => s.audioFile).length,
        scriptsWithVideo: scripts.filter(s => s.videoUrl || s.videoFile).length,
        allScriptsHaveContent: true,
        allScriptsHaveFiles: true,
        scriptOrder: true
      };
      
      // Check script count matches
      if (batch.scriptCount !== scripts.length) {
        issues.push(`Script count mismatch: expected ${batch.scriptCount}, found ${scripts.length}`);
      }
      
      // Check all scripts have content
      scripts.forEach((script, index) => {
        if (!script.content || script.content.trim() === '') {
          validationResults.allScriptsHaveContent = false;
          issues.push(`Script ${index} has no content`);
        }
        
        // Check script order is correct
        if (script.scriptIndex !== index) {
          validationResults.scriptOrder = false;
          issues.push(`Script order mismatch at index ${index}: expected ${index}, got ${script.scriptIndex}`);
        }
        
        // If video exists, audio should also exist
        if (script.videoUrl && !script.audioFile) {
          issues.push(`Script ${index} has video but no audio file`);
        }
      });
      
      // Check if all scripts have files when batch has videos
      if (batch.folderLink) {
        scripts.forEach((script, index) => {
          if (!script.videoUrl && !script.videoFile) {
            validationResults.allScriptsHaveFiles = false;
            issues.push(`Script ${index} is missing video file`);
          }
        });
      }
      
      const isValid = issues.length === 0;
      
      res.json({
        valid: isValid,
        validationResults,
        issues,
        message: isValid ? 'Batch integrity validated successfully' : 'Batch has integrity issues'
      });
    } catch (error) {
      console.error('Error validating batch:', error);
      res.status(500).json({
        error: 'Failed to validate batch',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Get batch details by ID
  app.get('/api/batches/:batchId', async (req, res) => {
    try {
      const { batchId } = req.params;
      
      const batch = await appStorage.getScriptBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ error: 'Batch not found' });
      }
      
      const scripts = await appStorage.getBatchScriptsByBatchId(batchId);
      
      res.json({
        batch: {
          ...batch,
          scripts: scripts.map(s => ({
            id: s.id,
            scriptIndex: s.scriptIndex,
            title: s.title,
            content: s.content,
            reasoning: s.reasoning,
            targetMetrics: s.targetMetrics,
            fileName: s.fileName,
            audioFile: s.audioFile,
            videoFile: s.videoFile,
            videoUrl: s.videoUrl,
            videoFileId: s.videoFileId,
            createdAt: s.createdAt
          }))
        },
        message: 'Batch details retrieved successfully'
      });
    } catch (error) {
      console.error('Error retrieving batch details:', error);
      res.status(500).json({
        error: 'Failed to retrieve batch details',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
  
  // Get recent batches for manual Slack trigger
  app.get('/api/batches/recent', async (req, res) => {
    try {
      const batches = await appStorage.getRecentScriptBatches(10);
      
      // For each batch, get the script count and video count
      const batchesWithDetails = await Promise.all(
        batches.map(async (batch) => {
          const scripts = await appStorage.getBatchScriptsByBatchId(batch.batchId);
          const videoCount = scripts.filter(s => s.videoUrl || s.videoFile).length;
          
          return {
            batchId: batch.batchId,
            spreadsheetId: batch.spreadsheetId,
            scriptCount: batch.scriptCount,
            videoCount,
            status: batch.status,
            folderLink: batch.folderLink,
            createdAt: batch.createdAt,
            guidancePrompt: batch.guidancePrompt
          };
        })
      );
      
      res.json({
        batches: batchesWithDetails,
        message: 'Recent batches retrieved successfully'
      });
    } catch (error) {
      console.error('Error retrieving recent batches:', error);
      res.status(500).json({
        error: 'Failed to retrieve recent batches',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Send batch to Slack using stored batch data - DISABLED FOR TESTING
  app.post('/api/slack/send-batch/:batchId', async (req, res) => {
    try {
      const { batchId } = req.params;
      
      // Check if Slack notifications are disabled
      if (process.env.DISABLE_SLACK_NOTIFICATIONS === 'true') {
        return res.status(200).json({ 
          success: true, 
          message: 'Slack notifications are currently disabled for testing' 
        });
      }
      
      // Retrieve batch from database
      const batch = await appStorage.getScriptBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ error: 'Batch not found' });
      }
      
      // Retrieve all scripts for the batch
      const scripts = await appStorage.getBatchScriptsByBatchId(batchId);
      if (scripts.length === 0) {
        return res.status(400).json({ error: 'No scripts found for this batch' });
      }
      
      // Prepare data for Slack
      const timestamp = new Date(batch.createdAt).toLocaleString('en-CA', { 
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(',', '');
      
      const batchData = {
        batchName: `Batch_${timestamp}`,
        videoCount: scripts.filter(s => s.videoUrl).length,
        scripts: scripts.map(s => ({
          title: s.title,
          content: s.content,
          fileName: s.fileName || generateScriptFileName(s.scriptIndex, s.title),
          videoUrl: s.videoUrl || undefined,
          videoFileId: s.videoFileId || undefined
        })),
        driveFolder: batch.folderLink || 'Google Drive folder',
        timestamp
      };
      
      // AUTOMATIC FAILSAFE: Validate batch integrity before sending to Slack
      const validationResult = await validateBatchIntegrity(batchId);
      if (!validationResult.valid) {
        console.error(`[FAILSAFE] Batch ${batchId} failed integrity check:`, validationResult.issues);
        return res.status(400).json({
          error: 'Batch failed integrity validation',
          issues: validationResult.issues,
          message: 'This batch has integrity issues and cannot be sent to Slack'
        });
      }
      
      // AUTOMATIC FAILSAFE: Verify content hashes match stored values
      for (const script of scripts) {
        if (script.contentHash) {
          const currentHash = crypto.createHash('sha256')
            .update(script.content)
            .digest('hex');
          
          if (currentHash !== script.contentHash) {
            console.error(`[FAILSAFE] Content hash mismatch for script "${script.title}"`);
            console.error(`Expected: ${script.contentHash}`);
            console.error(`Got: ${currentHash}`);
            
            await appStorage.createActivityLog({
              type: 'security_alert',
              message: `Content integrity violation detected in batch ${batchId}, script: ${script.title}`
            });
            
            return res.status(403).json({
              error: 'Content integrity violation detected',
              script: script.title,
              message: 'Script content has been modified since generation. This batch cannot be sent to Slack for security reasons.'
            });
          }
        }
      }
      
      // AUTOMATIC FAILSAFE: Check for duplicate script titles within batch
      const titles = new Set<string>();
      for (const script of scripts) {
        if (titles.has(script.title)) {
          console.error(`[FAILSAFE] Duplicate script title detected: "${script.title}"`);
          return res.status(400).json({
            error: 'Duplicate script titles detected',
            duplicateTitle: script.title,
            message: 'Batch contains duplicate script titles which could cause confusion'
          });
        }
        titles.add(script.title);
      }
      
      // AUTOMATIC FAILSAFE: Ensure all scripts have videos before sending
      const scriptsWithoutVideos = scripts.filter(s => !s.videoUrl && !s.videoFile);
      if (scriptsWithoutVideos.length > 0) {
        console.error(`[FAILSAFE] ${scriptsWithoutVideos.length} scripts have no videos`);
        return res.status(400).json({
          error: 'Scripts missing video files',
          count: scriptsWithoutVideos.length,
          scripts: scriptsWithoutVideos.map(s => s.title),
          message: 'All scripts must have videos before sending to Slack'
        });
      }
      
      // Send to Slack
      await slackService.sendVideoBatchForApproval(batchData);
      
      // Update batch status
      await appStorage.updateScriptBatchStatus(batchId, 'slack_sent');
      
      res.json({
        success: true,
        message: `Batch ${batchId} sent to Slack for approval`,
        videoCount: batchData.videoCount
      });
    } catch (error: any) {
      console.error('Error sending batch to Slack:', error);
      res.status(500).json({ 
        error: 'Failed to send batch to Slack',
        details: error.message 
      });
    }
  });
  
  // Legacy manual Slack batch trigger endpoint - PERMANENTLY BLOCKED
  app.post('/api/slack/manual-batch', async (req, res) => {
    // AUTOMATIC FAILSAFE: This endpoint is permanently blocked to prevent content mixing
    console.error('[FAILSAFE TRIGGERED] Attempt to use deprecated manual batch endpoint blocked');
    
    // Log the attempt for security auditing
    await appStorage.createActivityLog({
      type: 'security_warning',
      message: `Blocked attempt to use deprecated manual batch endpoint from IP: ${req.ip}`
    });
    
    res.status(403).json({
      error: 'This endpoint is permanently disabled for security',
      message: 'Manual JSON batch construction is not allowed. Use /api/slack/send-batch/:batchId with a valid batch ID from the database.',
      reason: 'This endpoint allowed mixing scripts from different batches which could cause approved content mismatch',
      alternative: '/api/slack/send-batch/:batchId'
    });
  });

  // List videos from a Google Drive folder URL (requires Meta auth)
  app.post('/api/drive/list-folder-videos', async (req, res) => {
    try {
      // Require authentication to prevent unauthorized access
      await getAccessToken();
      
      const { folderUrl } = req.body;
      
      if (!folderUrl) {
        return res.status(400).json({ error: 'Folder URL is required' });
      }
      
      if (!googleDriveService.isConfigured()) {
        return res.status(503).json({ error: 'Google Drive service is not configured' });
      }
      
      // Extract folder ID from URL
      let folderId = folderUrl;
      
      // Handle various Google Drive URL formats
      if (folderUrl.includes('drive.google.com')) {
        const match = folderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
        if (match) {
          folderId = match[1];
        } else {
          return res.status(400).json({ error: 'Could not extract folder ID from URL' });
        }
      }
      
      console.log(`Listing videos from folder: ${folderId}`);
      const videos = await googleDriveService.listVideosFromFolder(folderId);
      
      res.json({ 
        videos: videos.map((v: { id: string; name: string; size?: string; mimeType?: string }) => ({
          id: v.id,
          name: v.name,
          size: v.size ? formatBytes(parseInt(v.size)) : undefined,
          mimeType: v.mimeType
        }))
      });
    } catch (error: any) {
      console.error('Error listing folder videos:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to list videos from folder' 
      });
    }
  });
  
  // Upload a video from Google Drive to Meta Ad Account (requires Meta auth)
  app.post('/api/meta/upload-from-drive', async (req, res) => {
    try {
      // Get access token first to authenticate request
      const accessToken = await getAccessToken();
      
      const { driveFileId, fileName } = req.body;
      
      if (!driveFileId || !fileName) {
        return res.status(400).json({ error: 'driveFileId and fileName are required' });
      }
      
      if (!googleDriveService.isConfigured()) {
        return res.status(503).json({ error: 'Google Drive service is not configured' });
      }
      
      console.log(`Downloading ${fileName} from Drive for Meta upload...`);
      
      // Download the video from Google Drive
      const downloadResult = await googleDriveService.downloadVideoFile(driveFileId, fileName);
      
      if (!downloadResult.success || !downloadResult.filePath) {
        return res.status(500).json({ error: downloadResult.error || 'Failed to download from Drive' });
      }
      
      const localFilePath = downloadResult.filePath;
      console.log(`Downloaded to ${localFilePath}, uploading to Meta...`);
      
      // Upload to Meta
      const metaResult = await fileService.uploadFileToMeta(accessToken, localFilePath);
      
      console.log(`Successfully uploaded ${fileName} to Meta with ID: ${metaResult.id}`);
      
      // Clean up temp file
      try {
        fs.unlinkSync(localFilePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError);
      }
      
      res.json({
        success: true,
        metaVideoId: metaResult.id,
        fileName
      });
    } catch (error: any) {
      console.error('Error uploading to Meta:', error);
      res.status(500).json({ 
        error: error.message || 'Failed to upload to Meta' 
      });
    }
  });

  // Serve static files for uploads (backgrounds folder)
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
