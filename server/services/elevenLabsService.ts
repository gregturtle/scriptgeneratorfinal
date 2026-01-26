import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style?: number;
  use_speaker_boost?: boolean;
}

interface GenerateVoiceRequest {
  text: string;
  model_id?: string;
  voice_settings?: VoiceSettings;
}

interface Voice {
  voice_id: string;
  name: string;
  category: string;
  description?: string;
}

class ElevenLabsService {
  private apiKey: string;
  private baseUrl = 'https://api.elevenlabs.io/v1';

  constructor() {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
    if (!this.apiKey) {
      console.warn('ELEVENLABS_API_KEY not found. Voice generation will be disabled.');
    }
  }

  /**
   * Check if ElevenLabs is properly configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get available voices from ElevenLabs
   */
  async getVoices(): Promise<Voice[]> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      return response.data.voices || [];
    } catch (error) {
      console.error('Error fetching voices:', error);
      throw new Error('Failed to fetch available voices from ElevenLabs');
    }
  }

  /**
   * Generate speech from text using ElevenLabs
   */
  async generateSpeech(
    text: string,
    voiceId: string = 'flq6f7yk4E4fJM5XTYuZ', // Default voice (Mark)
    options: {
      stability?: number;
      similarityBoost?: number;
      style?: number;
      useSpeakerBoost?: boolean;
      modelId?: string;
    } = {}
  ): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const {
      stability = 0.5,
      similarityBoost = 0.75,
      style = 0.0,
      useSpeakerBoost = true,
      modelId = 'eleven_monolingual_v1'
    } = options;

    const requestData: GenerateVoiceRequest = {
      text,
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: useSpeakerBoost,
      },
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        requestData,
        {
          headers: {
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          responseType: 'arraybuffer',
        }
      );

      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('Error generating speech:', error.response?.data || error.message);
      throw new Error(`Failed to generate speech: ${error.response?.data?.detail || error.message}`);
    }
  }

  /**
   * Save generated audio to file
   */
  async saveAudioToFile(audioBuffer: Buffer, filename: string): Promise<string> {
    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Add .mp3 extension if not present
    const audioFilename = filename.endsWith('.mp3') ? filename : `${filename}.mp3`;
    const filePath = path.join(uploadsDir, audioFilename);

    fs.writeFileSync(filePath, audioBuffer);
    return filePath;
  }

  /**
   * Generate multiple voice recordings for script suggestions
   */
  async generateScriptVoiceovers(
    suggestions: Array<{
      title: string;
      content: string;
      nativeContent?: string; // Native language version when multilingual
      language?: string;      // Language code when multilingual
      reasoning: string;
      targetMetrics?: string[];
    }>,
    voiceId?: string,
    language?: string
  ): Promise<Array<{
    title: string;
    content: string;
    nativeContent?: string;
    language?: string;
    reasoning: string;
    targetMetrics?: string[];
    audioFile?: string;
    audioUrl?: string;
    error?: string;
  }>> {
    if (!this.isConfigured()) {
      console.warn('ElevenLabs not configured, returning suggestions without audio');
      return suggestions;
    }

    // Use Ella AI voice ID as default (what3words Ellabot 2.0)
    const defaultVoiceId = 'huvDR9lwwSKC0zEjZUox'; // Ella AI voice ID
    const selectedVoiceId = voiceId || defaultVoiceId;
    const isMultilingual = language && language !== 'en';
    
    console.log(`Using voice ID: ${selectedVoiceId}, Language: ${language || 'en'}, Multilingual: ${isMultilingual}`);

    const results = [];

    for (let i = 0; i < suggestions.length; i++) {
      const suggestion = suggestions[i];
      try {
        // Use native content for multilingual scripts, otherwise use regular content
        const textToSpeak = suggestion.nativeContent || suggestion.content;
        
        // Select appropriate model based on language
        let modelId = 'eleven_multilingual_v2'; // Default for English - better accent preservation
        if (language === 'kn') {
          // Kannada requires Eleven v3 model
          modelId = 'eleven_turbo_v2_5'; // Using the latest v3 model that supports Kannada
        } else if (isMultilingual) {
          // Other non-English languages use multilingual v2
          modelId = 'eleven_multilingual_v2';
        }
        
        console.log(`Generating voice for suggestion ${i + 1} in ${language || 'en'} using model ${modelId}`);
        
        // Generate audio for the script content
        const audioBuffer = await this.generateSpeech(
          textToSpeak,
          selectedVoiceId,
          {
            stability: 0.75, // High stability for consistent accent
            similarityBoost: 0.85, // Very high similarity to prevent accent drift
            style: 0.0, // Zero style to avoid any accent variation
            modelId: modelId // Use appropriate model based on language
          }
        );

        // Create filename based on suggestion title with readable timestamp
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19); // Format: YYYY-MM-DD_HH-MM-SS
        const filename = `script_${i + 1}_${suggestion.title.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)}_${timestamp}`;
        const filePath = await this.saveAudioToFile(audioBuffer, filename);
        
        // Create URL for frontend access
        const audioUrl = `/uploads/${path.basename(filePath)}`;
        console.log(`Generated voice for suggestion ${i + 1}: ${audioUrl}`);

        results.push({
          ...suggestion,
          audioFile: filePath,
          audioUrl: audioUrl,
        });
      } catch (error: any) {
        console.error(`Error generating voice for suggestion ${i + 1}:`, error.message);
        results.push({
          ...suggestion,
          error: `Voice generation failed: ${error.message}`,
        });
      }
    }

    return results;
  }

  /**
   * Get account information and usage
   */
  async getAccountInfo(): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const response = await axios.get(`${this.baseUrl}/user`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      console.error('Error fetching account info:', error);
      throw new Error('Failed to fetch account information from ElevenLabs');
    }
  }
}

export const elevenLabsService = new ElevenLabsService();