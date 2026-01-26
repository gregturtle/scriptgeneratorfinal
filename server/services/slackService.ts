import { type ChatPostMessageArguments, WebClient } from "@slack/web-api"
import { googleDriveService } from "./googleDriveService";

// Validate environment variables
if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN environment variable must be set");
}

if (!process.env.SLACK_CHANNEL_ID) {
  throw new Error("SLACK_CHANNEL_ID environment variable must be set");
}

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

// In-memory tracking for button decisions
const batchDecisions = new Map<string, Map<string, { approved: boolean; messageTs: string; videoFileId: string }>>();



export class SlackService {
  /**
   * Sends a structured message to the configured Slack channel
   */
  async sendMessage(message: ChatPostMessageArguments): Promise<string | undefined> {
    console.log('SlackService.sendMessage called with:', {
      channelId: process.env.SLACK_CHANNEL_ID,
      messageText: message.text,
      hasBlocks: !!message.blocks,
      tokenExists: !!process.env.SLACK_BOT_TOKEN
    });
    
    try {
      const response = await slack.chat.postMessage({
        ...message,
        channel: process.env.SLACK_CHANNEL_ID!,
      });

      console.log('Slack message sent successfully, timestamp:', response.ts);
      return response.ts;
    } catch (error) {
      console.error('Error sending Slack message:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Sends initial notification when a batch is being created
   */
  async sendBatchCreationNotification(
    batchName: string, 
    videoCount: number, 
    delayMinutes: number
  ): Promise<string | undefined> {
    try {
      const currentTime = new Date().toLocaleString('en-US', {
        timeZone: 'UTC',
        hour12: true,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });

      const reviewTime = new Date(Date.now() + delayMinutes * 60 * 1000).toLocaleString('en-US', {
        timeZone: 'UTC',
        hour12: true,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });

      const notificationMessage: ChatPostMessageArguments = {
        channel: process.env.SLACK_CHANNEL_ID!,
        text: `New batch of performance marketing ads being created: ${batchName}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚀 NEW BATCH IN PRODUCTION'
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📊 Batch Details\n• Batch Name: ${batchName}\n• Video Count: ${videoCount} performance marketing ads\n• Started: ${currentTime} UTC`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⏱️ Review Timeline\n\nVideos will be available for review in ${delayMinutes} minutes\nReview available: ${reviewTime} UTC\n\nThis delay allows Google Drive to fully process the uploaded videos for optimal review experience.`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎯 What's Next\n• Videos are being uploaded to Google Drive\n• Batch approval workflow will begin automatically in ${delayMinutes} minutes\n• You'll receive detailed review messages with video links\n• Each ad will need ✅ (approve) or ❌ (reject) reaction`
            }
          }
        ]
      };

      return await this.sendMessage(notificationMessage);
    } catch (error) {
      console.error('Error sending batch creation notification:', error);
      throw error;
    }
  }

  /**
   * Sends a video batch approval request to Slack with structured formatting
   */
  async sendVideoBatchForApproval(
    batchInfo: {
      batchName: string;
      videoCount: number;
      scripts: Array<{ 
        title: string; 
        content: string;
        nativeContent?: string;
        language?: string;
        notableAdjustments?: string;
        fileName?: string;
        videoUrl?: string;
        videoFileId?: string;
      }>;
      driveFolder: string;
      timestamp: string;
    }
  ): Promise<string | undefined> {
    try {
      // Send batch header message
      const headerMessage: ChatPostMessageArguments = {
        channel: process.env.SLACK_CHANNEL_ID!,
        text: `New video batch: ${batchInfo.batchName}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🚀 BATCH: ${batchInfo.batchName.toUpperCase()}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📊 Batch Summary\n• ${batchInfo.videoCount} videos created\n• Generated: ${batchInfo.timestamp}\n• <${batchInfo.driveFolder}|📁 View All Videos in Drive>`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🚨 URGENT REVIEW REQUIRED 🚨\n\nTHIS IS A FRESH BATCH OF NEW CONCEPTS\n\nALL VIDEOS MUST BE APPROVED OR REJECTED BEFORE THE NEXT TEST CAN COMMENCE\n\nSimple Instructions:\n• Watch the video by clicking the Google Drive link\n• Click the APPROVE or REJECT button below each video\n• Each ad needs ONE PERSON to click a button\n• DO NOT PROCEED until all ads have been reviewed`
            }
          },
          {
            type: 'divider'
          }
        ]
      };

      await this.sendMessage(headerMessage);

      // Track message timestamps and video file IDs for batch monitoring
      const messageTimestamps: string[] = [];
      const videoFileIds: string[] = [];

      // Send individual messages for each ad with reactions
      for (let i = 0; i < batchInfo.scripts.length; i++) {
        const script = batchInfo.scripts[i];
        const scriptNumber = i + 1;
        const fileName = script.fileName || `script${scriptNumber}`;
        
        console.log(`Slack script ${scriptNumber} data:`, {
          title: script.title,
          videoUrl: script.videoUrl,
          videoFileId: script.videoFileId
        });
        
        // Create properly formatted Google Drive link
        let videoLink = script.videoUrl;
        if (script.videoFileId) {
          videoLink = `https://drive.google.com/file/d/${script.videoFileId}/view?usp=drive_link`;
          videoFileIds.push(script.videoFileId);
        } else {
          videoFileIds.push(''); // Empty placeholder to keep array indices aligned
        }
        
        let adText = `🎬 AD ${scriptNumber}: ${script.title}\n`;
        adText += `📁 File: ${fileName}\n`;
        
        // Show both native and English versions if available
        if (script.nativeContent && script.language && script.language !== 'en') {
          // Get language name from language code
          const languageNames: { [key: string]: string } = {
            'de': 'German',
            'hi': 'Hindi', 
            'kn': 'Kannada',
            'es': 'Spanish',
            'fr': 'French',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ko': 'Korean',
            'ar': 'Arabic'
          };
          const languageName = languageNames[script.language] || script.language.toUpperCase();
          
          adText += `🌍 ${languageName} Script: "${script.nativeContent}"\n`;
          adText += `🇬🇧 English Translation: "${script.content}"\n`;
          
          // Add translation notes if present
          if (script.notableAdjustments) {
            adText += `📝 Translation Notes: ${script.notableAdjustments}\n`;
          }
        } else {
          adText += `💬 Script: "${script.content}"\n`;
        }

        // Add Google Drive video link with proper formatting
        if (videoLink) {
          adText += `\n🎥 Video: ${videoLink}`;
        } else {
          adText += `\n⚠️ Video not yet uploaded to Drive`;
        }

        const adMessage: ChatPostMessageArguments = {
          channel: process.env.SLACK_CHANNEL_ID!,
          text: `Ad ${scriptNumber}: ${script.title}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: adText
              }
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: '✅ APPROVE'
                  },
                  style: 'primary',
                  value: `approve||${batchInfo.batchName}||${scriptNumber}||${script.videoFileId || ''}`,
                  action_id: `approve_ad_${scriptNumber}`
                },
                {
                  type: 'button', 
                  text: {
                    type: 'plain_text',
                    text: '❌ REJECT'
                  },
                  style: 'danger',
                  value: `reject||${batchInfo.batchName}||${scriptNumber}||${script.videoFileId || ''}`,
                  action_id: `reject_ad_${scriptNumber}`
                }
              ]
            }
          ]
        };

        const messageTs = await this.sendMessage(adMessage);
        
        // Track message for monitoring (no auto-reactions)
        if (messageTs) {
          messageTimestamps.push(messageTs);
          // Removed auto-reactions - users will add their own ✅ or ❌
        }
      }

      // Initialize decision tracking for this batch
      batchDecisions.set(batchInfo.batchName, new Map());

      // Start monitoring the batch for completion immediately
      this.monitorBatchCompletionByButtons(batchInfo.batchName, batchInfo.scripts.length, videoFileIds);

      return 'batch-sent';
    } catch (error) {
      console.error('Error sending video batch for approval:', error);
      throw error;
    }
  }

  /**
   * Records a decision from button interaction
   */
  async recordDecision(
    batchName: string, 
    scriptNumber: string, 
    videoFileId: string, 
    approved: boolean, 
    messageTs: string
  ): Promise<void> {
    const batch = batchDecisions.get(batchName);
    if (batch) {
      batch.set(scriptNumber, { approved, messageTs, videoFileId });
      console.log(`[BUTTON DECISION] Batch: ${batchName}, Script: ${scriptNumber}, Decision: ${approved ? 'APPROVED' : 'REJECTED'}`);
      console.log(`[BUTTON DECISION] Current batch size: ${batch.size}, Available batches:`, Array.from(batchDecisions.keys()));
      console.log(`[BUTTON DECISION] Batch decisions:`, Array.from(batch.entries()));
    } else {
      console.log(`[BUTTON DECISION] ERROR: Batch ${batchName} not found in tracking. Available batches:`, Array.from(batchDecisions.keys()));
      console.log(`[BUTTON DECISION] Creating new batch tracking for ${batchName}`);
      batchDecisions.set(batchName, new Map());
      const newBatch = batchDecisions.get(batchName);
      if (newBatch) {
        newBatch.set(scriptNumber, { approved, messageTs, videoFileId });
        console.log(`[BUTTON DECISION] Created and recorded decision for new batch ${batchName}`);
      }
    }
  }

  /**
   * Manual completion check for testing - creates batch if it doesn't exist
   */
  async checkBatchCompletionManually(batchName: string, totalAds: number, videoFileIds: string[]): Promise<void> {
    console.log(`[MANUAL CHECK] Checking completion for batch ${batchName}`);
    
    let batchDecisionMap = batchDecisions.get(batchName);
    if (!batchDecisionMap) {
      console.log(`[MANUAL CHECK] Batch ${batchName} not found, but decision was recorded - this is normal for single-ad batches`);
      return;
    }
    
    const reviewedCount = batchDecisionMap.size;
    const approvedCount = Array.from(batchDecisionMap.values()).filter(d => d.approved).length;
    const rejectedCount = reviewedCount - approvedCount;
    
    console.log(`[MANUAL CHECK] Batch ${batchName} status - Reviewed: ${reviewedCount}/${totalAds}, Approved: ${approvedCount}, Rejected: ${rejectedCount}`);
    
    if (reviewedCount >= totalAds) {
      console.log(`[MANUAL CHECK] Batch ${batchName} is complete! Sending summary...`);
      await this.sendBatchCompletionSummary(batchName, totalAds, approvedCount, rejectedCount);
      
      // Process deletions for rejected videos
      const rejectedFileIds = Array.from(batchDecisionMap.values())
        .filter(d => !d.approved && d.videoFileId)
        .map(d => d.videoFileId);

      if (rejectedFileIds.length > 0) {
        try {
          const deletionResults = await googleDriveService.deleteFiles(rejectedFileIds);
          console.log(`[MANUAL CHECK] Deleted ${deletionResults.deletedCount}/${rejectedFileIds.length} rejected videos`);
        } catch (deletionError) {
          console.error(`[MANUAL CHECK] Error deleting videos:`, deletionError);
        }
      }
      
      // Clean up tracking
      batchDecisions.delete(batchName);
      console.log(`[MANUAL CHECK] Batch ${batchName} processing complete`);
    }
  }

  /**
   * Updates a message to show the decision made
   */
  async updateMessageWithDecision(
    channel: string,
    messageTs: string, 
    originalText: string,
    statusText: string,
    userName: string
  ): Promise<void> {
    try {
      await slack.chat.update({
        channel,
        ts: messageTs,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: originalText
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Decision: ${statusText} by ${userName}`
            }
          }
        ]
      });
    } catch (error) {
      console.error('Error updating Slack message:', error);
      throw error;
    }
  }

  /**
   * Monitors batch completion using button decisions instead of emoji reactions
   */
  async monitorBatchCompletionByButtons(
    batchName: string,
    totalAds: number,
    videoFileIds: string[]
  ): Promise<void> {
    let attempts = 0;
    const maxAttempts = 120; // 120 attempts * 30 seconds = 60 minutes max monitoring
    
    const checkCompletion = async () => {
      attempts++;
      console.log(`[BUTTON MONITOR] Monitoring attempt ${attempts}/${maxAttempts} for ${batchName}`);
      
      const batchDecisionMap = batchDecisions.get(batchName);
      if (!batchDecisionMap) {
        console.log(`[BUTTON MONITOR] No decisions found for batch ${batchName}`);
        if (attempts < maxAttempts) {
          setTimeout(checkCompletion, 30000);
        }
        return;
      }

      const reviewedCount = batchDecisionMap.size;
      const approvedCount = Array.from(batchDecisionMap.values()).filter(d => d.approved).length;
      const rejectedCount = reviewedCount - approvedCount;

      console.log(`[BUTTON MONITOR] Batch status - Reviewed: ${reviewedCount}/${totalAds}, Approved: ${approvedCount}, Rejected: ${rejectedCount}`);

      if (reviewedCount >= totalAds) {
        console.log(`[BUTTON MONITOR] Sending completion summary for ${batchName}`);
        await this.sendBatchCompletionSummary(batchName, totalAds, approvedCount, rejectedCount);
        
        // Process deletions for rejected videos
        const rejectedFileIds = Array.from(batchDecisionMap.values())
          .filter(d => !d.approved && d.videoFileId)
          .map(d => d.videoFileId);

        if (rejectedFileIds.length > 0) {
          console.log(`[BUTTON MONITOR] Processing video deletions for rejected videos`);
          console.log(`[BUTTON MONITOR] Video file IDs marked for deletion:`, rejectedFileIds);
          
          try {
            console.log(`[BUTTON MONITOR] Deleting ${rejectedFileIds.length} rejected videos from Google Drive`);
            const deletionResults = await googleDriveService.deleteFiles(rejectedFileIds);
            console.log(`[BUTTON MONITOR] Deletion complete: ${deletionResults.deletedCount}/${rejectedFileIds.length} videos deleted successfully`);
          } catch (deletionError) {
            console.error(`[BUTTON MONITOR] Error deleting videos:`, deletionError);
          }
        }

        // Clean up tracking for this batch
        batchDecisions.delete(batchName);
        console.log(`[BUTTON MONITOR] Summary message sent successfully for ${batchName}`);
        
      } else if (attempts < maxAttempts) {
        setTimeout(checkCompletion, 30000);
      } else {
        console.log(`[BUTTON MONITOR] Timeout reached for batch ${batchName} - stopping monitoring`);
      }
    };

    // Start monitoring immediately
    checkCompletion();
  }

  /**
   * Sends batch completion summary to Slack
   */
  async sendBatchCompletionSummary(
    batchName: string,
    totalAds: number,
    approvedCount: number,
    rejectedCount: number
  ): Promise<void> {
    try {
      const deletionText = rejectedCount > 0 
        ? `\n\n🗑️ Cleanup: ${rejectedCount} rejected video(s) automatically deleted from Google Drive`
        : '';

      const summaryMessage: ChatPostMessageArguments = {
        channel: process.env.SLACK_CHANNEL_ID!,
        text: `Batch ${batchName} review complete`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: `🎯 BATCH REVIEW COMPLETE: ${batchName.toUpperCase()}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📊 Final Results\n• Total Ads: ${totalAds}\n• ✅ Approved: ${approvedCount}\n• ❌ Rejected: ${rejectedCount}\n• Approval Rate: ${Math.round((approvedCount / totalAds) * 100)}%${deletionText}`
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: rejectedCount > 0 
                ? `✅ Workflow Complete\n\nOnly approved videos remain in Google Drive and are ready for Meta campaign upload. Rejected videos have been automatically removed to streamline the workflow.`
                : `✅ Workflow Complete\n\nAll videos approved! Ready for Meta campaign upload.`
            }
          }
        ]
      };

      await this.sendMessage(summaryMessage);
    } catch (error) {
      console.error('Error sending batch completion summary:', error);
      throw error;
    }
  }

  /**
   * Adds reactions to a message for voting
   */
  private async addReactions(messageTs: string, reactions: string[]): Promise<void> {
    try {
      for (const reaction of reactions) {
        await slack.reactions.add({
          channel: process.env.SLACK_CHANNEL_ID!,
          timestamp: messageTs,
          name: reaction,
        });
      }
    } catch (error) {
      console.error('Error adding reactions:', error);
      // Don't throw here as the message was sent successfully
    }
  }

  /**
   * Monitors batch completion with periodic checks
   */
  private async monitorBatchCompletion(
    batchName: string,
    messageTimestamps: string[],
    totalAds: number,
    videoFileIds: string[] = [],
    attempts: number = 0
  ): Promise<void> {
    const maxAttempts = 40; // Check for 20 minutes (40 * 30 seconds)
    
    try {
      console.log(`[SLACK MONITOR] Monitoring attempt ${attempts + 1}/${maxAttempts} for ${batchName}`);
      const isComplete = await this.checkBatchCompletion(batchName, messageTimestamps, totalAds, videoFileIds);
      
      if (!isComplete && attempts < maxAttempts) {
        // Continue monitoring every 30 seconds
        setTimeout(() => {
          this.monitorBatchCompletion(batchName, messageTimestamps, totalAds, videoFileIds, attempts + 1);
        }, 30000);
      } else if (attempts >= maxAttempts) {
        console.log(`[SLACK MONITOR] Monitoring timeout for ${batchName} after ${maxAttempts} attempts`);
      }
    } catch (error) {
      console.error(`[SLACK MONITOR] Error monitoring batch completion for ${batchName}:`, error);
    }
  }

  /**
   * Checks if all ads in a batch have been reviewed and sends summary
   */
  async checkBatchCompletion(
    batchName: string,
    messageTimestamps: string[],
    totalAds: number,
    videoFileIds: string[] = []
  ): Promise<boolean> {
    try {
      console.log(`[SLACK MONITOR] Checking batch completion for ${batchName} - ${messageTimestamps.length} messages, ${totalAds} total ads`);
      
      let approvedCount = 0;
      let rejectedCount = 0;
      let reviewedCount = 0;

      for (const messageTs of messageTimestamps) {
        const reactions = await slack.reactions.get({
          channel: process.env.SLACK_CHANNEL_ID!,
          timestamp: messageTs,
        });

        console.log(`[SLACK MONITOR] Message ${messageTs} reactions:`, reactions.message?.reactions);

        if (reactions.message?.reactions) {
          let hasApproval = false;
          let hasRejection = false;

          for (const reaction of reactions.message.reactions) {
            if (reaction.name === 'white_check_mark' && reaction.count && reaction.count > 0) {
              hasApproval = true;
            }
            if (reaction.name === 'x' && reaction.count && reaction.count > 0) {
              hasRejection = true;
            }
          }

          if (hasApproval || hasRejection) {
            reviewedCount++;
            if (hasApproval) approvedCount++;
            if (hasRejection) rejectedCount++;
            console.log(`[SLACK MONITOR] Message ${messageTs} reviewed - approved: ${hasApproval}, rejected: ${hasRejection}`);
          }
        }
      }

      console.log(`[SLACK MONITOR] Batch status - Reviewed: ${reviewedCount}/${totalAds}, Approved: ${approvedCount}, Rejected: ${rejectedCount}`);

      // Check if we have permission to read reactions
      if (reviewedCount === 0 && messageTimestamps.length > 0) {
        console.log(`[SLACK MONITOR] WARNING: No reactions found. Bot may need 'reactions:read' permission.`);
      }

      // Send summary if all ads are reviewed
      if (reviewedCount === totalAds) {
        console.log(`[SLACK MONITOR] Sending completion summary for ${batchName}`);
        
        // Identify and delete rejected videos from Google Drive
        let deletedCount = 0;
        let deletionErrors: string[] = [];
        
        if (videoFileIds.length > 0 && rejectedCount > 0) {
          console.log(`[SLACK MONITOR] Processing video deletions for rejected videos`);
          
          const rejectedFileIds: string[] = [];
          
          // Identify which videos were rejected based on message reactions
          for (let i = 0; i < messageTimestamps.length; i++) {
            const messageTs = messageTimestamps[i];
            const videoFileId = videoFileIds[i];
            
            if (!videoFileId) continue; // Skip if no video file ID
            
            try {
              const reactions = await slack.reactions.get({
                channel: process.env.SLACK_CHANNEL_ID!,
                timestamp: messageTs,
              });

              if (reactions.message?.reactions) {
                const hasRejection = reactions.message.reactions.some(
                  reaction => reaction.name === 'x' && reaction.count && reaction.count > 0
                );
                
                if (hasRejection) {
                  rejectedFileIds.push(videoFileId);
                  console.log(`[SLACK MONITOR] Video ${videoFileId} marked for deletion (rejected)`);
                }
              }
            } catch (error) {
              console.error(`[SLACK MONITOR] Error checking reactions for video deletion:`, error);
            }
          }
          
          // Delete rejected videos from Google Drive
          if (rejectedFileIds.length > 0) {
            console.log(`[SLACK MONITOR] Deleting ${rejectedFileIds.length} rejected videos from Google Drive`);
            
            try {
              console.log(`[SLACK MONITOR] File IDs to delete:`, rejectedFileIds);
              const deleteResult = await googleDriveService.deleteFiles(rejectedFileIds);
              deletedCount = deleteResult.deletedCount;
              deletionErrors = deleteResult.errors;
              
              console.log(`[SLACK MONITOR] Deletion complete: ${deleteResult.deletedCount}/${rejectedFileIds.length} videos deleted successfully`);
              if (deletionErrors.length > 0) {
                console.error(`[SLACK MONITOR] Deletion errors:`, deletionErrors);
                // Log the issue for debugging
                console.error(`[SLACK MONITOR] This suggests file IDs from video upload don't match Google Drive file IDs`);
              }
            } catch (error) {
              console.error(`[SLACK MONITOR] Error deleting rejected videos:`, error);
              deletionErrors.push(`Bulk deletion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        }
        
        // Build summary message with deletion information
        let summaryText = `${batchName.toUpperCase()} REVIEW SUMMARY\n\nALL VIDEOS HAVE NOW BEEN REVIEWED\n\n📊 Results:\n• ✅ Approved: ${approvedCount} videos\n• ❌ Rejected: ${rejectedCount} videos\n• 📋 Total reviewed: ${reviewedCount}/${totalAds}`;
        
        if (deletedCount > 0) {
          summaryText += `\n\n🗑️ Cleanup:\n• Deleted ${deletedCount} rejected videos from Google Drive`;
        }
        
        if (deletionErrors.length > 0) {
          summaryText += `\n• ⚠️ ${deletionErrors.length} deletion errors (see logs)`;
        }
        
        summaryText += `\n\nNEXT TEST CAN NOW COMMENCE 🚀`;
        
        const summaryMessage: ChatPostMessageArguments = {
          channel: process.env.SLACK_CHANNEL_ID!,
          text: `Batch ${batchName} review complete`,
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: '✅ BATCH REVIEW COMPLETE'
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: summaryText
              }
            }
          ]
        };

        try {
          await this.sendMessage(summaryMessage);
          console.log(`[SLACK MONITOR] Summary message sent successfully for ${batchName}`);
        } catch (error) {
          console.error(`[SLACK MONITOR] Failed to send summary message:`, error);
        }
        
        return true; // Batch is complete
      }
      
      return false; // Batch is not complete yet
    } catch (error) {
      console.error('Error checking batch completion:', error);
      // Don't throw here as this is a monitoring function
      return false;
    }
  }

  /**
   * Sends a simple notification message
   */
  async sendNotification(text: string): Promise<string | undefined> {
    try {
      const message: ChatPostMessageArguments = {
        channel: process.env.SLACK_CHANNEL_ID!,
        text: text,
      };

      return await this.sendMessage(message);
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }
}

export const slackService = new SlackService();