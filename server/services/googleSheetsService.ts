import { google } from 'googleapis';

interface CampaignPerformanceData {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  date: string;
}

class GoogleSheetsService {
  private sheets: any;
  private auth: any;

  constructor() {
    this.initializeAuth();
  }

  /**
   * Extract spreadsheet ID from URL or return as-is if already an ID
   */
  extractSpreadsheetId(input: string): string {
    // If it's already a spreadsheet ID (just alphanumeric), return as-is
    if (/^[a-zA-Z0-9-_]+$/.test(input) && !input.includes('/')) {
      return input;
    }
    
    // Extract ID from Google Sheets URL
    const urlMatch = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    
    // If no match found, assume it's already an ID
    return input;
  }

  private initializeAuth() {
    try {
      const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      
      if (!serviceAccountJson) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable not found');
      }

      const credentials = JSON.parse(serviceAccountJson);
      
      this.auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    } catch (error) {
      console.error('Failed to initialize Google Sheets authentication:', error);
      throw error;
    }
  }

  /**
   * Create a new Google Sheet for campaign performance data
   */
  async createPerformanceSheet(title: string = `Meta Campaign Performance - ${new Date().toISOString().split('T')[0]}`) {
    try {
      const request = {
        resource: {
          properties: {
            title,
          },
          sheets: [{
            properties: {
              title: 'CampaignPerformance',
            },
          }],
        },
      };

      const response = await this.sheets.spreadsheets.create(request);
      const spreadsheetId = response.data.spreadsheetId;

      // Add headers
      await this.addHeaders(spreadsheetId);

      return {
        spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
        title,
      };
    } catch (error) {
      console.error('Error creating Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Add headers to the performance sheet
   */
  private async addHeaders(spreadsheetId: string) {
    const headers = [
      'Campaign Name',
      'Ad ID', 
      'Ad Name',
      'Creative Title',
      'Creative Description',
      'Spend',
      'App Installs',
      'Save Location',
      'Directions', 
      'Share',
      'Search 3wa',
    ];

    const request = {
      spreadsheetId,
      range: 'Sheet1!A1:K1',
      valueInputOption: 'RAW',
      resource: {
        values: [headers],
      },
    };

    await this.sheets.spreadsheets.values.update(request);

    // Format headers (bold)
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: {
        requests: [{
          repeatCell: {
            range: {
              sheetId: 0,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: headers.length,
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true,
                },
              },
            },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        }],
      },
    });
  }

  /**
   * Get the first available sheet name from a spreadsheet
   */
  private async getFirstSheetName(spreadsheetId: string): Promise<string> {
    try {
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId,
      });
      
      if (response.data.sheets && response.data.sheets.length > 0) {
        return response.data.sheets[0].properties.title;
      }
      
      return 'Sheet1'; // Default fallback
    } catch (error) {
      console.error('Error getting sheet names:', error);
      return 'Sheet1'; // Default fallback
    }
  }

  /**
   * Append any data to existing sheet - simplified version
   */
  async appendSimpleData(spreadsheetId: string, data: any[]) {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const sheetName = await this.getFirstSheetName(cleanSpreadsheetId);
      
      // First, find the next empty row by getting existing data
      const existingDataResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `${sheetName}!A:A`, // Just get column A to find last row
      });
      
      const existingRows = existingDataResponse.data.values || [];
      const nextRow = existingRows.length + 1; // +1 because sheets are 1-indexed
      
      console.log(`Adding ${data.length} rows starting at row ${nextRow} in sheet "${sheetName}"`);

      // Use update instead of append to place data at specific location
      const request = {
        spreadsheetId: cleanSpreadsheetId,
        range: `${sheetName}!A${nextRow}:L${nextRow + data.length - 1}`,
        valueInputOption: 'RAW',
        resource: {
          values: data,
        },
      };

      const response = await this.sheets.spreadsheets.values.update(request);

      return {
        updatedRows: data.length,
        updatedRange: response.data.updatedRange || 'Unknown',
      };
    } catch (error) {
      console.error('Error adding data to Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Append performance data to existing sheet
   */
  async appendPerformanceData(spreadsheetId: string, data: CampaignPerformanceData[]) {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const sheetName = await this.getFirstSheetName(cleanSpreadsheetId);
      
      const values = data.map(campaign => [
        campaign.date,
        campaign.campaignId,
        campaign.campaignName,
        campaign.spend,
        campaign.impressions,
        campaign.clicks,
        campaign.conversions,
        campaign.ctr,
        campaign.cpc,
        campaign.cpm,
      ]);

      const request = {
        spreadsheetId: cleanSpreadsheetId,
        range: `${sheetName}!A:J`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values,
        },
      };

      await this.sheets.spreadsheets.values.append(request);

      return {
        updatedRows: values.length,
        updatedRange: `Campaign Performance!A${values.length + 2}:J${values.length * 2 + 1}`,
      };
    } catch (error) {
      console.error('Error appending data to Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Update existing sheet with new data (replaces all data except headers)
   */
  async updatePerformanceData(spreadsheetId: string, data: CampaignPerformanceData[]) {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      
      // Clear existing data (keep headers)
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: cleanSpreadsheetId,
        range: 'CampaignPerformance!A2:J',
      });

      // Add new data
      const values = data.map(campaign => [
        campaign.date,
        campaign.campaignId,
        campaign.campaignName,
        campaign.spend,
        campaign.impressions,
        campaign.clicks,
        campaign.conversions,
        campaign.ctr,
        campaign.cpc,
        campaign.cpm,
      ]);

      const request = {
        spreadsheetId: cleanSpreadsheetId,
        range: 'CampaignPerformance!A2:J',
        valueInputOption: 'RAW',
        resource: {
          values,
        },
      };

      await this.sheets.spreadsheets.values.update(request);

      return {
        updatedRows: values.length,
        updatedRange: `CampaignPerformance!A2:J${values.length + 1}`,
      };
    } catch (error) {
      console.error('Error updating Google Sheet:', error);
      throw error;
    }
  }

  /**
   * Get all available tabs/sheets in a spreadsheet
   */
  async getAvailableTabs(spreadsheetId: string): Promise<string[]> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: cleanSpreadsheetId,
      });
      
      if (response.data.sheets) {
        return response.data.sheets
          .map(sheet => sheet.properties?.title || '')
          .filter(title => title);
      }
      
      return [];
    } catch (error) {
      console.error('Error getting tabs from spreadsheet:', error);
      throw error;
    }
  }

  /**
   * Read scripts from a specific tab in the spreadsheet
   * Handles both simple 2-column format and full 8-column format
   */
  async readScriptsFromTab(spreadsheetId: string, tabName: string): Promise<any[]> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      
      // Read all data from the specified tab
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `${tabName}!A:H`, // Read columns A through H
      });
      
      const rows = response.data.values || [];
      if (rows.length < 2) {
        return []; // No data or only headers
      }
      
      const headers = rows[0];
      const dataRows = rows.slice(1);
      
      // Detect format based on headers and column count
      const isSimpleFormat = headers.length === 2 || 
                             (headers[0] && headers[1] && !headers[2]) ||
                             headers.some(h => h && (h.toLowerCase().includes('script name') || h.toLowerCase().includes('script copy')));
      
      if (isSimpleFormat) {
        // Simple 2-column format: Script Name | Script Copy
        console.log(`Detected simple 2-column format for tab: ${tabName}`);
        return dataRows
          .filter(row => row[0] && row[1]) // Filter out empty rows
          .map((row, index) => ({
            rowIndex: index + 2,
            generatedDate: new Date().toISOString().split('T')[0],
            fileTitle: row[0] || '',
            scriptTitle: row[0] || '', // Use first column as title
            recordingLanguage: 'English',
            nativeContent: row[1] || '', // Use second column as script content
            content: row[1] || '', // Same content for English
            translationNotes: '',
            reasoning: '',
          }));
      } else {
        // Full 8-column format from exported scripts
        console.log(`Detected full 8-column format for tab: ${tabName}`);
        return dataRows.map((row, index) => ({
          rowIndex: index + 2,
          generatedDate: row[0] || '',
          fileTitle: row[1] || '',
          scriptTitle: row[2] || '',
          recordingLanguage: row[3] || 'English',
          nativeContent: row[4] || '',
          content: row[5] || '',
          translationNotes: row[6] || '',
          reasoning: row[7] || '',
        }));
      }
    } catch (error) {
      console.error('Error reading scripts from tab:', error);
      throw error;
    }
  }

  /**
   * Create a new tab/sheet in an existing spreadsheet
   */
  async createTab(spreadsheetId: string, tabName: string, headers: string[]) {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      
      // Try to create the tab
      try {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: cleanSpreadsheetId,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tabName,
                  },
                },
              },
            ],
          },
        });

        // Add headers to new tab
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: cleanSpreadsheetId,
          range: `${tabName}!A1:${String.fromCharCode(64 + headers.length)}1`,
          valueInputOption: "RAW",
          resource: {
            values: [headers],
          },
        });
      } catch (error) {
        // Tab might already exist, just add headers
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: cleanSpreadsheetId,
          range: `${tabName}!A1:${String.fromCharCode(64 + headers.length)}1`,
          valueInputOption: "RAW",
          resource: {
            values: [headers],
          },
        });
      }
    } catch (error) {
      console.error('Error creating tab:', error);
      throw error;
    }
  }

  /**
   * Append data to a specific tab in a spreadsheet
   */
  async appendDataToTab(spreadsheetId: string, tabName: string, data: any[][]) {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      
      // Find next empty row
      const existingDataResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `${tabName}!A:A`,
      });

      const existingRows = existingDataResponse.data.values || [];
      const nextRow = existingRows.length + 1;

      const columnCount = Math.max(...data.map(row => row.length));
      const endColumn = String.fromCharCode(64 + columnCount);

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: cleanSpreadsheetId,
        range: `${tabName}!A${nextRow}:${endColumn}${nextRow + data.length - 1}`,
        valueInputOption: "RAW",
        resource: {
          values: data,
        },
      });

      console.log(`Added ${data.length} rows to tab "${tabName}"`);
    } catch (error) {
      console.error('Error appending data to tab:', error);
      throw error;
    }
  }

  /**
   * Read data from a specific tab in a spreadsheet
   */
  async readTabData(spreadsheetId: string, tabName: string, range: string = "A:Z") {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `${tabName}!${range}`,
      });

      return response.data.values || [];
    } catch (error) {
      console.error('Error reading tab data:', error);
      throw error;
    }
  }

  /**
   * Get existing spreadsheet info
   */
  async getSpreadsheetInfo(spreadsheetId: string) {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: cleanSpreadsheetId,
      });

      return {
        title: response.data.properties.title,
        url: response.data.spreadsheetUrl,
        sheets: response.data.sheets.map((sheet: any) => ({
          title: sheet.properties.title,
          sheetId: sheet.properties.sheetId,
        })),
      };
    } catch (error) {
      console.error('Error getting spreadsheet info:', error);
      throw error;
    }
  }

  /**
   * Ensure ScriptDatabase tab exists with proper headers
   */
  async ensureScriptDatabaseTab(spreadsheetId: string): Promise<void> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const tabName = "ScriptDatabase";
      const headers = [
        "ScriptBatchID",
        "ScriptID",
        "MKJobID",
        "DateTimestampCreated",
        "ScriptLanguage",
        "ScriptCopy",
        "ScriptAIPrompt",
        "AIModel"
      ];

      // Check if tab exists
      try {
        await this.sheets.spreadsheets.values.get({
          spreadsheetId: cleanSpreadsheetId,
          range: `${tabName}!A1`,
        });
        console.log(`ScriptDatabase tab already exists`);
      } catch (error: any) {
        // Tab doesn't exist, create it
        if (error.code === 400 || error.message?.includes('Unable to parse range')) {
          console.log(`Creating ScriptDatabase tab with headers`);
          await this.createTab(cleanSpreadsheetId, tabName, headers);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error('Error ensuring ScriptDatabase tab:', error);
      throw error;
    }
  }

  /**
   * Get the latest BatchID and ScriptID from ScriptDatabase tab
   */
  async getLatestScriptDatabaseIds(spreadsheetId: string): Promise<{ lastBatchId: number; lastScriptId: number }> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const tabName = "ScriptDatabase";

      // Read columns A and B (BatchID and ScriptID)
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `${tabName}!A:B`,
      });

      const rows = response.data.values || [];
      
      if (rows.length <= 1) {
        // Only header or empty, start from 10000
        return { lastBatchId: 10000, lastScriptId: 10000 };
      }

      // Get the last row with data
      let lastBatchId = 10000;
      let lastScriptId = 10000;

      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        if (row[0] && row[1]) {
          const batchNum = parseInt(row[0], 10);
          const scriptNum = parseInt(row[1], 10);
          if (!isNaN(batchNum) && batchNum > lastBatchId) {
            lastBatchId = batchNum;
          }
          if (!isNaN(scriptNum) && scriptNum > lastScriptId) {
            lastScriptId = scriptNum;
          }
        }
      }

      return { lastBatchId, lastScriptId };
    } catch (error: any) {
      // If tab doesn't exist yet, return starting values
      if (error.code === 400 || error.message?.includes('Unable to parse range')) {
        return { lastBatchId: 10000, lastScriptId: 10000 };
      }
      console.error('Error getting latest ScriptDatabase IDs:', error);
      return { lastBatchId: 10000, lastScriptId: 10000 };
    }
  }

  /**
   * Append scripts to the ScriptDatabase tab with sequential IDs
   */
  async appendToScriptDatabase(
    spreadsheetId: string,
    scripts: Array<{
      language: string;
      scriptCopy: string;
      aiPrompt: string;
      aiModel: string;
    }>
  ): Promise<void> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const tabName = "ScriptDatabase";

      // Ensure the tab exists
      await this.ensureScriptDatabaseTab(cleanSpreadsheetId);

      // Get the latest IDs from the sheet
      const { lastBatchId, lastScriptId } = await this.getLatestScriptDatabaseIds(cleanSpreadsheetId);

      // New batch ID is last batch + 1
      const newBatchId = lastBatchId + 1;
      // Script IDs start from last script + 1
      let nextScriptId = lastScriptId + 1;

      // Generate timestamp
      const timestamp = new Date().toISOString();

      // Prepare rows with sequential IDs
      const rows = scripts.map(script => {
        const scriptId = nextScriptId;
        nextScriptId++;
        return [
          newBatchId.toString(),
          scriptId.toString(),
          "0", // MKJobID always 0 for AI-generated
          timestamp,
          script.language,
          script.scriptCopy,
          script.aiPrompt,
          script.aiModel
        ];
      });

      // Append to the tab
      await this.appendDataToTab(cleanSpreadsheetId, tabName, rows);
      console.log(`Added ${scripts.length} scripts to ScriptDatabase tab (BatchID: ${newBatchId}, ScriptIDs: ${lastScriptId + 1}-${nextScriptId - 1})`);
    } catch (error) {
      console.error('Error appending to ScriptDatabase:', error);
      throw error;
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
export type { CampaignPerformanceData };