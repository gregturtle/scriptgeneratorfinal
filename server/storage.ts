import { 
  AuthToken, InsertAuthToken, 
  File, InsertFile,
  Campaign, InsertCampaign,
  Creative, InsertCreative,
  ActivityLog, InsertActivityLog,
  ScriptBatch, InsertScriptBatch,
  BatchScript, InsertBatchScript,
  authTokens, files, campaigns, creatives, activityLogs, scriptBatches, batchScripts
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need
export interface IStorage {
  // Auth tokens
  saveAuthToken(token: InsertAuthToken): Promise<AuthToken>;
  getLatestAuthToken(): Promise<AuthToken | undefined>;
  clearAuthTokens(): Promise<void>;
  
  // Files
  createFile(file: InsertFile): Promise<File>;
  getFileById(id: number): Promise<File | undefined>;
  updateFile(id: number, updates: Partial<InsertFile>): Promise<File>;
  
  // Campaigns
  upsertCampaign(campaign: InsertCampaign): Promise<Campaign>;
  getCampaignById(id: string): Promise<Campaign | undefined>;
  
  // Creatives
  createCreative(creative: InsertCreative): Promise<Creative>;
  getCreativesByFileId(fileId: number): Promise<Creative[]>;
  
  // Activity logs
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogs(limit?: number): Promise<ActivityLog[]>;
  
  // Script Batches
  createScriptBatch(batch: InsertScriptBatch): Promise<ScriptBatch>;
  getScriptBatchByBatchId(batchId: string): Promise<ScriptBatch | undefined>;
  getRecentScriptBatches(limit?: number): Promise<ScriptBatch[]>;
  updateScriptBatchStatus(batchId: string, status: string): Promise<ScriptBatch>;
  updateScriptBatch(batchId: string, updates: Partial<InsertScriptBatch>): Promise<ScriptBatch>;
  
  // Batch Scripts
  createBatchScript(script: InsertBatchScript): Promise<BatchScript>;
  createBatchScripts(scripts: InsertBatchScript[]): Promise<BatchScript[]>;
  getBatchScriptsByBatchId(batchId: string): Promise<BatchScript[]>;
  updateBatchScript(id: number, updates: Partial<InsertBatchScript>): Promise<BatchScript>;
}

export class DatabaseStorage implements IStorage {
  // Auth tokens
  async saveAuthToken(token: InsertAuthToken): Promise<AuthToken> {
    const [authToken] = await db
      .insert(authTokens)
      .values(token)
      .returning();
    
    return authToken;
  }

  async getLatestAuthToken(): Promise<AuthToken | undefined> {
    const [token] = await db
      .select()
      .from(authTokens)
      .orderBy(desc(authTokens.createdAt))
      .limit(1);
    
    return token;
  }

  async clearAuthTokens(): Promise<void> {
    await db
      .delete(authTokens);
  }
  
  // Files
  async createFile(file: InsertFile): Promise<File> {
    const [newFile] = await db
      .insert(files)
      .values(file)
      .returning();
    
    return newFile;
  }

  async getFileById(id: number): Promise<File | undefined> {
    const [file] = await db
      .select()
      .from(files)
      .where(eq(files.id, id));
    
    return file;
  }

  async updateFile(id: number, updates: Partial<InsertFile>): Promise<File> {
    const [updatedFile] = await db
      .update(files)
      .set(updates)
      .where(eq(files.id, id))
      .returning();
    
    if (!updatedFile) {
      throw new Error(`File with ID ${id} not found`);
    }
    
    return updatedFile;
  }
  
  // Campaigns
  async upsertCampaign(campaign: InsertCampaign): Promise<Campaign> {
    // Try to find the campaign first
    const [existingCampaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    
    if (existingCampaign) {
      // Update existing campaign
      const [updatedCampaign] = await db
        .update(campaigns)
        .set({
          ...campaign,
          updatedAt: new Date()
        })
        .where(eq(campaigns.id, campaign.id))
        .returning();
      
      return updatedCampaign;
    } else {
      // Create new campaign
      const [newCampaign] = await db
        .insert(campaigns)
        .values({
          ...campaign,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .returning();
      
      return newCampaign;
    }
  }

  async getCampaignById(id: string): Promise<Campaign | undefined> {
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, id));
    
    return campaign;
  }
  
  // Creatives
  async createCreative(creative: InsertCreative): Promise<Creative> {
    const [newCreative] = await db
      .insert(creatives)
      .values(creative)
      .returning();
    
    return newCreative;
  }

  async getCreativesByFileId(fileId: number): Promise<Creative[]> {
    const results = await db
      .select()
      .from(creatives)
      .where(eq(creatives.fileId, fileId));
    
    return results;
  }
  
  // Activity logs
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db
      .insert(activityLogs)
      .values(log)
      .returning();
    
    return newLog;
  }

  async getActivityLogs(limit: number = 50): Promise<ActivityLog[]> {
    const logs = await db
      .select()
      .from(activityLogs)
      .orderBy(desc(activityLogs.timestamp))
      .limit(limit);
    
    return logs;
  }
  
  // Script Batches
  async createScriptBatch(batch: InsertScriptBatch): Promise<ScriptBatch> {
    const [newBatch] = await db
      .insert(scriptBatches)
      .values(batch)
      .returning();
    
    return newBatch;
  }

  async getScriptBatchByBatchId(batchId: string): Promise<ScriptBatch | undefined> {
    const [batch] = await db
      .select()
      .from(scriptBatches)
      .where(eq(scriptBatches.batchId, batchId));
    
    return batch;
  }

  async getRecentScriptBatches(limit: number = 10): Promise<ScriptBatch[]> {
    const batches = await db
      .select()
      .from(scriptBatches)
      .orderBy(desc(scriptBatches.createdAt))
      .limit(limit);
    
    return batches;
  }

  async updateScriptBatchStatus(batchId: string, status: string): Promise<ScriptBatch> {
    const [updatedBatch] = await db
      .update(scriptBatches)
      .set({ status })
      .where(eq(scriptBatches.batchId, batchId))
      .returning();
    
    if (!updatedBatch) {
      throw new Error(`Script batch with ID ${batchId} not found`);
    }
    
    return updatedBatch;
  }

  async updateScriptBatch(batchId: string, updates: Partial<InsertScriptBatch>): Promise<ScriptBatch> {
    const [updatedBatch] = await db
      .update(scriptBatches)
      .set(updates)
      .where(eq(scriptBatches.batchId, batchId))
      .returning();
    
    if (!updatedBatch) {
      throw new Error(`Script batch with ID ${batchId} not found`);
    }
    
    return updatedBatch;
  }
  
  // Batch Scripts
  async createBatchScript(script: InsertBatchScript): Promise<BatchScript> {
    const [newScript] = await db
      .insert(batchScripts)
      .values(script)
      .returning();
    
    return newScript;
  }

  async createBatchScripts(scripts: InsertBatchScript[]): Promise<BatchScript[]> {
    if (scripts.length === 0) {
      return [];
    }
    
    const newScripts = await db
      .insert(batchScripts)
      .values(scripts)
      .returning();
    
    return newScripts;
  }

  async getBatchScriptsByBatchId(batchId: string): Promise<BatchScript[]> {
    const scripts = await db
      .select()
      .from(batchScripts)
      .where(eq(batchScripts.batchId, batchId))
      .orderBy(batchScripts.scriptIndex);
    
    return scripts;
  }

  async updateBatchScript(id: number, updates: Partial<InsertBatchScript>): Promise<BatchScript> {
    const [updatedScript] = await db
      .update(batchScripts)
      .set(updates)
      .where(eq(batchScripts.id, id))
      .returning();
    
    if (!updatedScript) {
      throw new Error(`Batch script with ID ${id} not found`);
    }
    
    return updatedScript;
  }
}

// Replace MemStorage with DatabaseStorage
export const storage = new DatabaseStorage();
