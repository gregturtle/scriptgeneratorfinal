import fs from 'fs';
import path from 'path';

interface SubtitleSegment {
  start: number; // milliseconds
  end: number;   // milliseconds
  text: string;
}

export class SubtitleService {
  private subtitlesDir: string;

  constructor() {
    this.subtitlesDir = path.join(process.cwd(), 'uploads', 'subtitles');
    
    if (!fs.existsSync(this.subtitlesDir)) {
      fs.mkdirSync(this.subtitlesDir, { recursive: true });
      console.log('Created subtitles directory:', this.subtitlesDir);
    }
  }

  /**
   * Convert milliseconds to SRT timestamp format (HH:MM:SS,mmm)
   */
  private msToSrtTime(ms: number): string {
    const totalMs = Math.max(0, Math.round(ms));
    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const milliseconds = Math.floor(totalMs % 1000);
    
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
  }

  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence boundaries (., !, ?) followed by space or end of string
    const sentences = text
      .split(/([.!?]+\s+|[.!?]+$)/)
      .filter(s => s.trim().length > 0)
      .reduce((acc: string[], curr, i, arr) => {
        // Combine sentence with its punctuation
        if (i % 2 === 0 && arr[i + 1]) {
          acc.push((curr + arr[i + 1]).trim());
        } else if (i % 2 === 0) {
          acc.push(curr.trim());
        }
        return acc;
      }, []);

    // If no sentences were found (no punctuation), treat the whole text as one sentence
    if (sentences.length === 0) {
      return [text.trim()];
    }

    return sentences;
  }

  /**
   * Generate subtitle segments with timing based on audio duration
   */
  private generateSegments(text: string, durationMs: number): SubtitleSegment[] {
    const sentences = this.splitIntoSentences(text);
    
    if (sentences.length === 0) {
      return [];
    }

    // Calculate total character count for proportional timing
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
    
    const segments: SubtitleSegment[] = [];
    let currentTime = 0;

    sentences.forEach((sentence, index) => {
      // Allocate time proportional to sentence length
      const sentenceChars = sentence.length;
      const proportion = sentenceChars / totalChars;
      const segmentDuration = durationMs * proportion;

      // Ensure minimum duration of 1 second per subtitle
      const minDuration = 1000;
      const adjustedDuration = Math.max(segmentDuration, minDuration);

      const start = Math.round(currentTime);
      const end = Math.round(Math.min(currentTime + adjustedDuration, durationMs));

      segments.push({
        start,
        end,
        text: sentence
      });

      currentTime = end;
    });

    // Adjust last segment to end exactly at audio duration
    if (segments.length > 0) {
      segments[segments.length - 1].end = Math.round(durationMs);
    }

    return segments;
  }

  /**
   * Generate SRT file content from segments
   */
  private generateSrtContent(segments: SubtitleSegment[]): string {
    return segments
      .map((segment, index) => {
        return `${index + 1}\n${this.msToSrtTime(segment.start)} --> ${this.msToSrtTime(segment.end)}\n${segment.text}\n`;
      })
      .join('\n');
  }

  /**
   * Convert audio-optimized text to subtitle-optimized text
   */
  private prepareTextForSubtitles(text: string): string {
    // Replace "what three words" with "what3words" for brand consistency in subtitles
    return text.replace(/what three words/gi, 'what3words');
  }

  /**
   * Create SRT subtitle file for a script
   */
  async createSubtitleFile(
    text: string,
    durationSeconds: number,
    outputFileName: string
  ): Promise<string> {
    try {
      const durationMs = durationSeconds * 1000;
      
      // Convert text for subtitle display (e.g., "what three words" → "what3words")
      const subtitleText = this.prepareTextForSubtitles(text);
      
      // Generate subtitle segments
      const segments = this.generateSegments(subtitleText, durationMs);
      
      if (segments.length === 0) {
        throw new Error('No subtitle segments generated - text may be empty');
      }

      // Generate SRT content
      const srtContent = this.generateSrtContent(segments);
      
      // Write to file
      const srtFileName = outputFileName.replace(/\.\w+$/, '.srt');
      const srtFilePath = path.join(this.subtitlesDir, srtFileName);
      
      fs.writeFileSync(srtFilePath, srtContent, 'utf8');
      
      console.log(`Created subtitle file: ${srtFilePath} with ${segments.length} segments`);
      
      return srtFilePath;
    } catch (error) {
      console.error('Error creating subtitle file:', error);
      throw error;
    }
  }

  /**
   * Delete subtitle file
   */
  deleteSubtitleFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted subtitle file: ${filePath}`);
      }
    } catch (error) {
      console.error('Error deleting subtitle file:', error);
    }
  }
}

// Export singleton instance
export const subtitleService = new SubtitleService();
