import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Auth Tokens
export const authTokens = pgTable("auth_tokens", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuthTokenSchema = createInsertSchema(authTokens).omit({
  id: true,
  createdAt: true,
});

// Files
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull(),
  size: integer("size").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("uploading"),
  metaAssetId: text("meta_asset_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFileSchema = createInsertSchema(files).omit({
  id: true,
  createdAt: true,
});

// Campaigns (cached from Meta API)
export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  budget: integer("budget").notNull(),
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  objective: text("objective"),
  metaData: jsonb("meta_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCampaignSchema = createInsertSchema(campaigns).omit({
  createdAt: true,
  updatedAt: true,
});

// Creatives (assigned to campaigns)
export const creatives = pgTable("creatives", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  metaCreativeId: text("meta_creative_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCreativeSchema = createInsertSchema(creatives).omit({
  id: true,
  createdAt: true,
});

// Activity logs
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({
  id: true,
});

// Script Generation Batches - tracks each generation batch with unique ID
export const scriptBatches = pgTable("script_batches", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id").notNull().unique(), // Unique batch identifier
  spreadsheetId: text("spreadsheet_id"),
  tabName: text("tab_name"),
  voiceId: text("voice_id"),
  guidancePrompt: text("guidance_prompt"),
  backgroundVideoPath: text("background_video_path"),
  scriptCount: integer("script_count").notNull(),
  folderLink: text("folder_link"), // Google Drive folder for batch
  slackMessageTs: text("slack_message_ts"), // Slack message timestamp for tracking
  status: text("status").notNull().default("generated"), // generated, slack_sent, approved, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScriptBatchSchema = createInsertSchema(scriptBatches).omit({
  id: true,
  createdAt: true,
});

// Batch Scripts - stores the actual script content for each batch
export const batchScripts = pgTable("batch_scripts", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id").notNull(), // Links to scriptBatches.batchId
  scriptIndex: integer("script_index").notNull(), // Order in batch (0-based)
  title: text("title").notNull(),
  content: text("content").notNull(), // The actual script text
  contentHash: text("content_hash"), // SHA-256 hash of content for integrity checking
  reasoning: text("reasoning"),
  targetMetrics: text("target_metrics"),
  fileName: text("file_name"),
  audioFile: text("audio_file"), // Path to audio file if generated
  audioChecksum: text("audio_checksum"), // Checksum of audio file for integrity
  videoFile: text("video_file"), // Path to video file if generated
  videoUrl: text("video_url"), // Google Drive URL
  videoFileId: text("video_file_id"), // Google Drive file ID
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertBatchScriptSchema = createInsertSchema(batchScripts).omit({
  id: true,
  createdAt: true,
});

// Types
export type InsertAuthToken = z.infer<typeof insertAuthTokenSchema>;
export type AuthToken = typeof authTokens.$inferSelect;

export type InsertFile = z.infer<typeof insertFileSchema>;
export type File = typeof files.$inferSelect;

export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaigns.$inferSelect;

export type InsertCreative = z.infer<typeof insertCreativeSchema>;
export type Creative = typeof creatives.$inferSelect;

export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;

export type InsertScriptBatch = z.infer<typeof insertScriptBatchSchema>;
export type ScriptBatch = typeof scriptBatches.$inferSelect;

export type InsertBatchScript = z.infer<typeof insertBatchScriptSchema>;
export type BatchScript = typeof batchScripts.$inferSelect;

// Frontend types
export type FileUpload = {
  id: string;
  name: string;
  size: number;
  type: string;
  status: 'uploading' | 'ready' | 'error' | 'completed';
  path: string;
  createdAt: string;
};

// Frontend version of ActivityLog
export type FrontendActivityLog = {
  id: string;
  type: string;
  message: string;
  timestamp: string;
};

export type LaunchResult = {
  successCount: number;
  errorCount: number;
  creativeIds: string[];
  errors: any[];
};
