import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PrimerPattern {
  feature: string;
  direction: 'Lean into' | 'Avoid / soften';
  percentageChange: string;
  potentialImpact: string;
  evidence: string;
  exampleSnippet: string;
}

class PrimerService {
  private defaultPrimerPath = path.join(__dirname, '../data/default_primer.csv');

  /**
   * Parse CSV content into primer patterns
   */
  parsePrimerCSV(csvContent: string): PrimerPattern[] {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('Invalid primer CSV: missing header or data');
    }

    // Skip header row
    const dataLines = lines.slice(1);
    const patterns: PrimerPattern[] = [];

    for (const line of dataLines) {
      // Simple CSV parsing - handles quoted fields
      const fields = this.parseCSVLine(line);
      
      if (fields.length >= 6) {
        patterns.push({
          feature: fields[0],
          direction: fields[1] as 'Lean into' | 'Avoid / soften',
          percentageChange: fields[2],
          potentialImpact: fields[3],
          evidence: fields[4],
          exampleSnippet: fields[5],
        });
      }
    }

    return patterns;
  }

  /**
   * Parse a single CSV line, handling quoted fields
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim());
    return result;
  }

  /**
   * Load the default primer from the server
   */
  async loadDefaultPrimer(): Promise<PrimerPattern[]> {
    try {
      const csvContent = fs.readFileSync(this.defaultPrimerPath, 'utf-8');
      return this.parsePrimerCSV(csvContent);
    } catch (error) {
      console.error('Error loading default primer:', error);
      throw new Error('Failed to load default primer');
    }
  }

  /**
   * Load raw CSV content from primers folder
   */
  async loadPrimerCSVContent(customContent?: string): Promise<string> {
    if (customContent) {
      return customContent;
    }
    
    // Load from primers folder
    const primerPath = path.join(__dirname, '../data/primers/guidance_primer.csv');
    try {
      const csvContent = fs.readFileSync(primerPath, 'utf-8');
      return csvContent;
    } catch (error) {
      console.error('Error loading primer CSV:', error);
      throw new Error('Failed to load primer CSV from primers folder');
    }
  }

  /**
   * Load primer from uploaded file content
   */
  async loadCustomPrimer(csvContent: string): Promise<PrimerPattern[]> {
    try {
      return this.parsePrimerCSV(csvContent);
    } catch (error) {
      console.error('Error parsing custom primer:', error);
      throw new Error('Failed to parse custom primer CSV');
    }
  }

  /**
   * Group patterns by confidence level
   */
  groupByConfidence(patterns: PrimerPattern[]): {
    veryConfident: PrimerPattern[];
    quiteConfident: PrimerPattern[];
    lowConfidence: PrimerPattern[];
  } {
    const veryConfident = patterns.filter(p => p.potentialImpact === 'Very Confident');
    const quiteConfident = patterns.filter(p => p.potentialImpact === 'Quite Confident');
    const lowConfidence = patterns.filter(p => p.potentialImpact === 'Low Confidence');

    return { veryConfident, quiteConfident, lowConfidence };
  }
}

export const primerService = new PrimerService();
