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
   * Split text into word chunks of specified size (5-6 words per chunk)
   * Tries to break at natural pause points when possible
   */
  private splitIntoWordChunks(text: string, wordsPerChunk: number = 5): string[] {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length === 0) {
      return [];
    }
    
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    
    for (let i = 0; i < words.length; i++) {
      currentChunk.push(words[i]);
      
      // Check if we should end this chunk
      const atChunkLimit = currentChunk.length >= wordsPerChunk;
      const atMaxLimit = currentChunk.length >= wordsPerChunk + 1; // Allow 1 extra word for natural breaks
      const currentWord = words[i];
      const isNaturalBreak = /[,;:\-\u2014]$/.test(currentWord) || /[.!?]$/.test(currentWord);
      const isLastWord = i === words.length - 1;
      
      // End chunk if: at max limit, or at chunk limit with natural break, or last word
      if (atMaxLimit || (atChunkLimit && isNaturalBreak) || isLastWord) {
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
      } else if (atChunkLimit) {
        // Look ahead - if next word ends with punctuation, include it
        const nextWord = words[i + 1];
        if (nextWord && /[,;:\-\u2014.!?]$/.test(nextWord)) {
          // Include next word to keep punctuation with its word
          continue;
        }
        chunks.push(currentChunk.join(' '));
        currentChunk = [];
      }
    }
    
    // Add any remaining words
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }
    
    return chunks;
  }

  /**
   * Generate subtitle segments with timing based on audio duration
   * Uses word-based chunking (5-6 words per segment) for better readability
   */
  private generateSegments(text: string, durationMs: number): SubtitleSegment[] {
    const chunks = this.splitIntoWordChunks(text, 5); // 5-6 words per chunk
    
    if (chunks.length === 0) {
      return [];
    }

    // Calculate total word count for proportional timing
    const totalWords = chunks.reduce((sum, chunk) => sum + chunk.split(/\s+/).length, 0);
    
    const segments: SubtitleSegment[] = [];
    let currentTime = 0;

    chunks.forEach((chunk) => {
      // Allocate time proportional to word count in chunk
      const chunkWords = chunk.split(/\s+/).length;
      const proportion = chunkWords / totalWords;
      const segmentDuration = durationMs * proportion;

      // Ensure minimum duration of 0.8 seconds per subtitle (faster pace for short chunks)
      const minDuration = 800;
      const adjustedDuration = Math.max(segmentDuration, minDuration);

      const start = Math.round(currentTime);
      const end = Math.round(Math.min(currentTime + adjustedDuration, durationMs));

      segments.push({
        start,
        end,
        text: chunk
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
