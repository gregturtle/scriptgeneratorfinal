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
   * Read scripts from Script_Database tab
   * Returns script_batch_id, script_id, timestamp, language_id, script_copy, ai_model, status
   */
  async readScriptDatabase(spreadsheetId: string): Promise<{
    scriptBatchId: string;
    scriptId: string;
    timestamp: string;
    languageId: string;
    scriptCopy: string;
    aiModel: string;
    status: string;
  }[]> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `Script_Database!A:G`,
      });
      
      const rows = response.data.values || [];
      if (rows.length < 2) {
        return [];
      }
      
      const dataRows = rows.slice(1); // Skip header row
      
      return dataRows
        .filter(row => row[0] && row[1]) // Must have batch_id and script_id
        .map(row => ({
          scriptBatchId: (row[0] || '').toString().trim(),
          scriptId: (row[1] || '').toString().trim(),
          timestamp: (row[2] || '').toString().trim(),
          languageId: (row[3] || '').toString().trim(),
          scriptCopy: (row[4] || '').toString().trim(),
          aiModel: (row[5] || '').toString().trim(),
          status: (row[6] || 'pending').toString().trim(),
        }));
    } catch (error) {
      console.error('Error reading Script_Database:', error);
      throw error;
    }
  }

  /**
   * Read base film entries from the Base_Database tab
   * Base_Id is in column A, file_link is in column G
   */
  async readBaseDatabase(spreadsheetId: string): Promise<{ baseId: string; baseTitle: string; fileLink: string }[]> {
    const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);

    const normalizeHeader = (value: string) =>
      value.toLowerCase().replace(/\s+/g, '').replace(/_/g, '');

    const extractUrlFromFormula = (formula: string): string | null => {
      const match = formula.match(/HYPERLINK\(\s*\"([^\"]+)\"/i);
      return match?.[1] || null;
    };

    const cellText = (cell: any): string => {
      if (!cell) return '';
      if (typeof cell.formattedValue === 'string') return cell.formattedValue;
      const effective = cell.effectiveValue;
      if (effective?.stringValue) return effective.stringValue;
      if (effective?.numberValue !== undefined) return effective.numberValue.toString();
      const entered = cell.userEnteredValue;
      if (entered?.stringValue) return entered.stringValue;
      if (entered?.numberValue !== undefined) return entered.numberValue.toString();
      if (entered?.formulaValue) return entered.formulaValue;
      return '';
    };

    const cellLink = (cell: any): string => {
      if (!cell) return '';
      if (cell.hyperlink) return cell.hyperlink;
      const formula = cell.userEnteredValue?.formulaValue || cell.effectiveValue?.formulaValue;
      if (typeof formula === 'string') {
        const extracted = extractUrlFromFormula(formula);
        if (extracted) return extracted;
      }
      return cellText(cell);
    };

    const parseRows = (rows: any[][], linkResolver: (value: string) => string): { baseId: string; baseTitle: string; fileLink: string }[] => {
      if (rows.length < 2) return [];
      const headers = rows[0].map((cell) => (cell ?? '').toString());
      const normalizedHeaders = headers.map(normalizeHeader);
      const baseHeaderIndex = normalizedHeaders.findIndex(h => h === 'baseid' || h === 'baseids');
      const titleHeaderIndex = normalizedHeaders.findIndex(h => h === 'basetitle');
      const linkHeaderIndex = normalizedHeaders.findIndex(h => h === 'filelink' || h === 'filelinks');
      const baseIndex = baseHeaderIndex !== -1 ? baseHeaderIndex : 0;
      const titleIndex = titleHeaderIndex !== -1 ? titleHeaderIndex : 1;
      const linkIndex = linkHeaderIndex !== -1 ? linkHeaderIndex : 6;

      return rows
        .slice(1)
        .map((row) => {
          const baseId = (row[baseIndex] ?? '').toString().trim();
          const baseTitle = (row[titleIndex] ?? '').toString().trim();
          const linkRaw = (row[linkIndex] ?? '').toString().trim();
          const fileLink = linkResolver(linkRaw).toString().trim();
          return { baseId, baseTitle, fileLink };
        })
        .filter(entry => entry.baseId && entry.fileLink);
    };

    try {
      const sheetMeta = await this.sheets.spreadsheets.get({
        spreadsheetId: cleanSpreadsheetId,
      });

      const normalizedTarget = normalizeHeader('Base_Database');
      const baseSheetTitle =
        sheetMeta.data.sheets
          ?.map((sheet: any) => sheet.properties?.title)
          .find((title: string | undefined) => title && normalizeHeader(title) === normalizedTarget) ||
        'Base_Database';

      // First attempt: read formatted values (fast, works for plain URLs)
      const formattedResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `${baseSheetTitle}!A:Z`,
        valueRenderOption: 'FORMATTED_VALUE',
      });
      const formattedRows = formattedResponse.data.values || [];
      console.log(`Base_Database: Found ${formattedRows.length} rows in tab "${baseSheetTitle}"`);
      if (formattedRows.length > 0) {
        console.log('Base_Database headers:', formattedRows[0]);
        if (formattedRows.length > 1) {
          console.log('Base_Database first data row:', formattedRows[1]);
        }
      }
      const formattedEntries = parseRows(formattedRows, (value) => value);
      console.log(`Base_Database: parseRows returned ${formattedEntries.length} entries`);
      if (formattedEntries.length > 0) {
        return formattedEntries;
      }

      // Second attempt: read formulas (captures HYPERLINK formulas)
      const formulaResponse = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `${baseSheetTitle}!A:Z`,
        valueRenderOption: 'FORMULA',
      });
      const formulaRows = formulaResponse.data.values || [];
      const formulaEntries = parseRows(formulaRows, (value) => extractUrlFromFormula(value) || value);
      if (formulaEntries.length > 0) {
        return formulaEntries;
      }

      // Final attempt: grid data for smart chips / rich links
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: cleanSpreadsheetId,
        ranges: [`${baseSheetTitle}!A:Z`],
        includeGridData: true,
      });

      const baseSheet =
        response.data.sheets?.find((sheet: any) => sheet.properties?.title === baseSheetTitle) ||
        response.data.sheets?.[0];
      const rowData = baseSheet?.data?.[0]?.rowData || [];
      if (rowData.length < 2) {
        return [];
      }

      const headerCells = rowData[0]?.values || [];
      const headers = headerCells.map((cell: any) => cellText(cell));
      const normalizedHeaders = headers.map(normalizeHeader);

      const baseHeaderIndex = normalizedHeaders.findIndex(h => h === 'baseid' || h === 'baseids');
      const linkHeaderIndex = normalizedHeaders.findIndex(h => h === 'filelink' || h === 'filelinks');
      const baseIndex = baseHeaderIndex !== -1 ? baseHeaderIndex : 0;
      const linkIndex = linkHeaderIndex !== -1 ? linkHeaderIndex : 6;

      return rowData
        .slice(1)
        .map((row: any) => {
          const cells = row?.values || [];
          const baseId = cellText(cells[baseIndex]).toString().trim();
          const fileLink = cellLink(cells[linkIndex]).toString().trim();
          return { baseId, fileLink };
        })
        .filter(entry => entry.baseId && entry.fileLink);
    } catch (error) {
      console.error('Error reading base database from tab:', error);
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

  private readonly SCRIPT_DATABASE_TAB_NAME = 'Script_Database';

  /**
   * Get the latest BatchID and ScriptID from Script_Database tab
   * Parses IDs in format sb00001 and s00001
   */
  async getLatestScriptDatabaseIds(spreadsheetId: string): Promise<{ lastBatchNum: number; lastScriptNum: number }> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: cleanSpreadsheetId,
        range: `${this.SCRIPT_DATABASE_TAB_NAME}!A:B`,
      });

      const rows = response.data.values || [];
      
      if (rows.length <= 1) {
        return { lastBatchNum: 0, lastScriptNum: 0 };
      }

      let lastBatchNum = 0;
      let lastScriptNum = 0;

      for (let i = rows.length - 1; i >= 1; i--) {
        const row = rows[i];
        if (row[0] && row[1]) {
          const batchMatch = row[0].match(/sb(\d+)/);
          const scriptMatch = row[1].match(/s(\d+)/);
          
          if (batchMatch) {
            const batchNum = parseInt(batchMatch[1], 10);
            if (!isNaN(batchNum) && batchNum > lastBatchNum) {
              lastBatchNum = batchNum;
            }
          }
          if (scriptMatch) {
            const scriptNum = parseInt(scriptMatch[1], 10);
            if (!isNaN(scriptNum) && scriptNum > lastScriptNum) {
              lastScriptNum = scriptNum;
            }
          }
        }
      }

      return { lastBatchNum, lastScriptNum };
    } catch (error: any) {
      console.error('Error getting latest Script_Database IDs:', error);
      return { lastBatchNum: 0, lastScriptNum: 0 };
    }
  }

  /**
   * Record scripts to the Script_Database tab in the user's spreadsheet
   * Format: script_batch_id | script_id | timestamp | language_id | script_copy | ai_model | status
   */
  async recordScriptsToDatabase(
    spreadsheetId: string,
    scripts: Array<{
      language: string;
      scriptCopy: string;
      aiModel: string;
    }>
  ): Promise<{ batchId: string; scriptIds: string[] }> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      const { lastBatchNum, lastScriptNum } = await this.getLatestScriptDatabaseIds(cleanSpreadsheetId);

      const newBatchNum = lastBatchNum + 1;
      const batchId = `sb${String(newBatchNum).padStart(5, '0')}`;
      
      let nextScriptNum = lastScriptNum + 1;
      const timestamp = new Date().toISOString();
      const scriptIds: string[] = [];

      const rows = scripts.map(script => {
        const scriptId = `s${String(nextScriptNum).padStart(5, '0')}`;
        scriptIds.push(scriptId);
        nextScriptNum++;
        
        return [
          batchId,
          scriptId,
          timestamp,
          script.language.toLowerCase(),
          script.scriptCopy,
          script.aiModel,
          'pending'
        ];
      });

      await this.appendDataToTab(cleanSpreadsheetId, this.SCRIPT_DATABASE_TAB_NAME, rows);
      console.log(`Recorded ${scripts.length} scripts to Script_Database (Batch: ${batchId}, Scripts: ${scriptIds[0]}-${scriptIds[scriptIds.length - 1]})`);
      
      return { batchId, scriptIds };
    } catch (error) {
      console.error('Error recording scripts to database:', error);
      throw error;
    }
  }

  private readonly ASSET_DATABASE_TAB_NAME = 'Asset_Database';

  /**
   * Write asset entries to Asset_Database tab and read back the auto-generated File_Name
   * Finds rows where columns E, H, and L are empty (other columns may have formulas)
   * Writes: Column E (Base_Id), Column H (Script_Id), Column L (Subtitled Y/N)
   * Reads back: Column A (File_Name - formula generated)
   */
  async writeAssetEntries(
    spreadsheetId: string,
    entries: Array<{
      baseId: string;
      scriptId: string;
      subtitled: boolean;
    }>
  ): Promise<Array<{ fileName: string; baseId: string; scriptId: string }>> {
    try {
      const cleanSpreadsheetId = this.extractSpreadsheetId(spreadsheetId);
      
      console.log(`Writing ${entries.length} asset entries to Asset_Database`);

      // Read columns E, H, and L to find rows where all three are empty
      const dataResponse = await this.sheets.spreadsheets.values.batchGet({
        spreadsheetId: cleanSpreadsheetId,
        ranges: [
          `${this.ASSET_DATABASE_TAB_NAME}!E:E`,
          `${this.ASSET_DATABASE_TAB_NAME}!H:H`,
          `${this.ASSET_DATABASE_TAB_NAME}!L:L`
        ]
      });
      
      const colE = dataResponse.data.valueRanges?.[0]?.values || [];
      const colH = dataResponse.data.valueRanges?.[1]?.values || [];
      const colL = dataResponse.data.valueRanges?.[2]?.values || [];
      
      // Find first row where E, H, and L are all empty (skip header row 1)
      const maxRows = Math.max(colE.length, colH.length, colL.length, 1);
      let startRow = -1;
      
      for (let row = 1; row <= maxRows + entries.length; row++) {
        // Check if this row has E, H, and L all empty
        const eVal = colE[row]?.[0]?.toString().trim() || '';
        const hVal = colH[row]?.[0]?.toString().trim() || '';
        const lVal = colL[row]?.[0]?.toString().trim() || '';
        
        if (eVal === '' && hVal === '' && lVal === '') {
          startRow = row + 1; // Convert to 1-indexed row number
          break;
        }
      }
      
      // If no empty row found in existing data, start after the last row
      if (startRow === -1) {
        startRow = maxRows + 1;
      }
      
      console.log(`Found first empty row at ${startRow}, writing ${entries.length} entries`);

      // Build batch update data for each entry
      const batchData: Array<{range: string; values: any[][]}> = [];
      const writtenRows: number[] = [];
      
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const rowNum = startRow + i;
        writtenRows.push(rowNum);
        
        // Add Base_Id to column E
        batchData.push({
          range: `${this.ASSET_DATABASE_TAB_NAME}!E${rowNum}`,
          values: [[entry.baseId]]
        });
        
        // Add Script_Id to column H
        batchData.push({
          range: `${this.ASSET_DATABASE_TAB_NAME}!H${rowNum}`,
          values: [[entry.scriptId]]
        });
        
        // Add Subtitled (Y/N) to column L
        batchData.push({
          range: `${this.ASSET_DATABASE_TAB_NAME}!L${rowNum}`,
          values: [[entry.subtitled ? 'Y' : 'N']]
        });
      }
      
      // Execute batch update
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: cleanSpreadsheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: batchData
        }
      });
      
      console.log(`Wrote entries to rows ${writtenRows.join(', ')}`);
      
      // Wait for formulas to recalculate
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Poll for File_Names with retry logic from the exact written rows
      const endRow = startRow + entries.length - 1;
      let fileNames: any[][] = [];
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        const fileNamesResponse = await this.sheets.spreadsheets.values.get({
          spreadsheetId: cleanSpreadsheetId,
          range: `${this.ASSET_DATABASE_TAB_NAME}!A${startRow}:A${endRow}`,
        });
        
        fileNames = fileNamesResponse.data.values || [];
        
        // Check if all File_Names are populated
        const allPopulated = fileNames.length === entries.length && 
          fileNames.every(row => row[0] && row[0].toString().trim() !== '');
        
        if (allPopulated) {
          break;
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          console.log(`File_Names not fully populated, waiting 1 second before retry (attempt ${attempts}/${maxAttempts})`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Build results
      const results: Array<{ fileName: string; baseId: string; scriptId: string }> = [];
      
      for (let i = 0; i < entries.length; i++) {
        const fileName = fileNames[i]?.[0] || `asset_${entries[i].scriptId}_${entries[i].baseId}`;
        results.push({
          fileName,
          baseId: entries[i].baseId,
          scriptId: entries[i].scriptId
        });
        console.log(`Asset entry ${i + 1}: File_Name=${fileName}`);
      }
      
      console.log(`Successfully wrote ${entries.length} entries to Asset_Database`);
      return results;
    } catch (error) {
      console.error('Error writing to Asset_Database:', error);
      throw error;
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
export type { CampaignPerformanceData };
