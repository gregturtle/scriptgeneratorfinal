import OpenAI from "openai";
import { googleSheetsService } from "./googleSheetsService";
import { elevenLabsService } from "./elevenLabsService";
import { primerService, PrimerPattern } from "./primerService";
import { generateJsonResponse, LLMProvider } from "./llmService";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface ScriptSuggestion {
  title: string;
  content: string;
  nativeContent?: string;  // Native language version when multilingual
  englishContent?: string; // English translation when multilingual
  language?: string;       // Language code when multilingual
  notableAdjustments?: string; // Translation notes for localization decisions
  reasoning: string;
  targetMetrics?: string[];
  audioFile?: string;
  audioUrl?: string;
  error?: string;
  fileName?: string;
  videoFile?: string;
  videoUrl?: string;
  videoFileId?: string;
  videoError?: string;
  folderLink?: string;
  llmModel?: string;       // The LLM model used to generate this script
  sourceScriptTitle?: string; // For iterations: title of the source script
  sourceScript?: string;      // For iterations: content of the source script
}

class AIScriptService {
  /**
   * Map language codes to their full names
   */
  private getLanguageName(code: string): string {
    const languageNames: { [key: string]: string } = {
      'en': 'English',
      'es': 'Spanish', 
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'ar': 'Arabic',
      'hi': 'Hindi',
      'nl': 'Dutch',
      'pl': 'Polish',
      'tr': 'Turkish',
      'sv': 'Swedish',
      'no': 'Norwegian',
      'da': 'Danish',
      'fi': 'Finnish',
      'he': 'Hebrew',
      'el': 'Greek',
      'cs': 'Czech',
      'hu': 'Hungarian',
      'ro': 'Romanian',
      'th': 'Thai',
      'vi': 'Vietnamese',
      'id': 'Indonesian',
      'ms': 'Malay',
      'uk': 'Ukrainian',
      'bn': 'Bengali',
      'ta': 'Tamil',
      'te': 'Telugu',
      'mr': 'Marathi',
      'gu': 'Gujarati',
      'ur': 'Urdu',
      'pa': 'Punjabi',
      'kn': 'Kannada'
    };
    return languageNames[code] || code.toUpperCase();
  }

  /**
   * Generate script suggestions using guidance primer
   */
  async generateScriptSuggestions(
    spreadsheetId: string,
    options: {
      voiceId?: string;
      includeVoice?: boolean;
      scriptCount?: number;
      guidancePrompt?: string;
      language?: string;
      primerContent?: string;
      experimentalPercentage?: number;
      individualGeneration?: boolean;
      llmProvider?: LLMProvider;
    } = {}
  ): Promise<{
    suggestions: ScriptSuggestion[];
    message: string;
    voiceGenerated?: boolean;
  }> {
    const { 
      voiceId, 
      includeVoice = false, 
      scriptCount = 5, 
      guidancePrompt, 
      language = 'en',
      primerContent,
      experimentalPercentage = 50,
      individualGeneration = false,
      llmProvider = 'openai'
    } = options;
    
    try {
      // Load raw CSV content for the primer
      const primerCSVContent = await primerService.loadPrimerCSVContent(primerContent);
      console.log('Loaded primer CSV content');
      
      // Generate suggestions using OpenAI
      const targetLanguage = this.getLanguageName(language);
      const isMultilingual = language !== 'en';
      console.log(`Experimentation level: ${experimentalPercentage}%`);

      // Build the creative inspiration section
      const creativeInspirationSection = guidancePrompt ? guidancePrompt.trim() : '';

      const prompt = `OBJECTIVE
You are a copywriter specialising in advertising voiceovers for video ads to run on Meta social platforms, goal of the user downloading the what3words app and then going on to do a key what3words metric action. The background visuals are constant - you only write the spoken narration. Your task is to write voiceover scripts, guided by proven performance patterns from our 'Guidance Primer'. 

SCRIPT STRUCTURE:
Write voice-only scripts with three parts:
OPENING: Start with an attention-grabbing or intriguing line

PRODUCT EXPLANATION: Briefly and clearly explain what three words

CLOSING CALL-TO-ACTION: End with a call to action, with an optional nod to the opening line.

CONSTRAINTS (ALL LANGUAGES):
Never mention a rooftop or similar, as what3words doesn't work vertically
Because a what3words square is 3m x 3m, use '3 meter square' (or similar) if referring to area and never '3 meter squared' which is the incorrect area.
Never mention or show any specific or example what3words address itself
The app name "what three words" should always appear in every ad, and it should always be written exactly like that, and only written in English (never localised).
Other than the phrase "what three words", don't use any language other than the selected script language for the script.

CONSTRAINTS (ENGLISH LANGUAGE SCRIPTS):
A what three words location can only be written as "what three words address", "what three words location", "three word code", "three word address", or "three word identifier"

NON-ENGLISH LANGUAGE SPECIFIC CONSTRAINTS (when requested script language does not equal 'English'):
No current constraints.

ADDITIONAL CREATIVE INSPIRATION:
${creativeInspirationSection}
PRIMER
GUIDANCE PRIMER – PERFORMANCE PATTERNS CSV:
${primerCSVContent}

Where there are phrases in the guidance primer in a specific language, if the selected language is different, consider it conceptually in the target language rather than literally.
Proportion of Scripts to follow or deviate from primer guidance:
${experimentalPercentage}% of scripts should be EXPERIMENTAL/CURVEBALL scripts that can deviate from the primer, trying novel approaches that might not be covered in the primer, for example:
Push creative boundaries with unusual angles, concepts, or approaches

Use unexpected metaphors, statements, perspectives

Experiment with different tones: mysterious, urgent, playful, philosophical, provocative etc (not an exhaustive list, can use your own judgement)

Explore creative edges that humans might not consider

${100 - experimentalPercentage}% of scripts should FOLLOW the primer guidance closely
Use the data provided as to which themes help or hinder performance to try to create winning scripts.
TASK:
Write ${scriptCount} new voiceover ${scriptCount === 1 ? 'script' : 'scripts'} with maximum creative diversity:
Vary tone, structure, opening style, and creative approach dramatically between scripts

Are only spoken narration (no visual descriptions)

Must be exactly 40–46 words (never exceed 14–15 seconds when spoken naturally)

Always write "what three words" instead of "what3words" for proper voice pronunciation

Scripts over 46 words will be rejected

OUTPUT FORMAT:
Respond in JSON format:
{
  "suggestions": [
    {
      "title": "Voiceover concept name",
      "content": "Complete voiceover script - spoken words only)",
      "reasoning": "Detailed explanation of primer patterns followed or deliberately deviated from"
    }
  ]
}
`;

      let suggestions: ScriptSuggestion[] = [];

      if (individualGeneration) {
        // Individual generation mode: Make concurrent API calls, up to 5 scripts per call
        const scriptsPerCall = Math.min(scriptCount, 5);
        const numCalls = Math.ceil(scriptCount / scriptsPerCall);
        console.log(`Individual generation mode: Making ${numCalls} concurrent API calls (${scriptsPerCall} scripts per call)`);
        
        // Use the actual scriptsPerCall value (no prompt modification needed if it matches)
        const scriptWord = scriptCount === 1 ? 'script' : 'scripts';
        const scriptsPerCallWord = scriptsPerCall === 1 ? 'script' : 'scripts';
        const individualPrompt = prompt.replace(
          `Write ${scriptCount} new voiceover ${scriptWord}`, 
          `Write ${scriptsPerCall} new voiceover ${scriptsPerCallWord}`
        );
        
        // Create array of promises for concurrent execution
        const systemPrompt = isMultilingual 
          ? `You are a multilingual creative director and experimental copywriter fluent in ${targetLanguage}. You think and create NATIVELY in ${targetLanguage}, not through translation. You use data-driven insights from the Guidance Primer while maintaining creative flexibility. You excel at balancing proven patterns with experimental approaches based on the specified experimentation level. Your goal is maximum creative variety - never repeat the same approach twice.`
          : `You are a creative director and experimental copywriter who uses data-driven insights from the Guidance Primer while maintaining creative flexibility. You excel at balancing proven patterns with experimental approaches based on the specified experimentation level. Your goal is maximum creative variety - never repeat the same approach twice.`;

        const apiCalls = Array.from({ length: numCalls }, (_, callIndex) => {
          console.log(`[API Call ${callIndex + 1}] Using ${llmProvider} for individual generation`);
          
          return generateJsonResponse(llmProvider, {
            prompt: individualPrompt,
            systemPrompt,
            reasoningEffort: "high",
          }).then(llmResponse => {
            const result = llmResponse.parsed;
            const modelUsed = llmResponse.model;
            
            if (!result.suggestions || !Array.isArray(result.suggestions)) {
              console.warn(`Invalid or empty response for API call ${callIndex + 1}`);
              return [];
            }

            // Process all scripts from this call
            return result.suggestions.map((suggestion: any) => {
              // For multilingual, preserve the native content properly
              if (isMultilingual) {
                if (suggestion.englishContent) {
                  // If provided English translation, use it
                  return {
                    ...suggestion,
                    nativeContent: suggestion.content, // Native stays in nativeContent
                    content: suggestion.englishContent, // English in content
                    language: language,
                    llmModel: modelUsed
                  };
                } else {
                  // If no English provided yet, keep native in content for now
                  // Translation step will fix this later
                  return {
                    ...suggestion,
                    language: language,
                    llmModel: modelUsed
                  };
                }
              }
              return { ...suggestion, llmModel: modelUsed };
            });
          }).catch(error => {
            console.error(`Error in API call ${callIndex + 1}:`, error);
            return [];
          });
        });
        
        // Wait for all API calls to complete
        const results = await Promise.all(apiCalls);
        
        // Flatten the array of arrays and take only the requested number of scripts
        suggestions = results.flat().slice(0, scriptCount);
        
        console.log(`Individual generation complete: ${suggestions.length} scripts generated concurrently from ${numCalls} calls`);
      } else {
        // Batch generation mode: Single API call requesting all scripts
        console.log(`Batch generation mode: Making 1 API call for ${scriptCount} scripts using ${llmProvider}`);
        
        const systemPrompt = isMultilingual 
          ? `You are a multilingual creative director and experimental copywriter fluent in ${targetLanguage}. You think and create NATIVELY in ${targetLanguage}, not through translation. You use data-driven insights from the Guidance Primer while maintaining creative flexibility. You excel at balancing proven patterns with experimental approaches based on the specified experimentation level. Your goal is maximum creative variety - never repeat the same approach twice.`
          : `You are a creative director and experimental copywriter who uses data-driven insights from the Guidance Primer while maintaining creative flexibility. You excel at balancing proven patterns with experimental approaches based on the specified experimentation level. Your goal is maximum creative variety - never repeat the same approach twice.`;

        const llmResponse = await generateJsonResponse(llmProvider, {
          prompt,
          systemPrompt,
          reasoningEffort: "high",
        });

        const result = llmResponse.parsed;
        const modelUsed = llmResponse.model;

        if (!result.suggestions || !Array.isArray(result.suggestions)) {
          throw new Error(`Invalid response format from ${llmProvider}`);
        }

        console.log(`Generated ${result.suggestions.length} script suggestions in ${targetLanguage} using ${llmProvider} (model: ${modelUsed})`);
        
        // Process multilingual responses
        suggestions = result.suggestions.map((suggestion: any) => {
          // For multilingual, preserve the native content properly
          if (isMultilingual) {
            if (suggestion.englishContent) {
              // If provided English translation, use it
              return {
                ...suggestion,
                nativeContent: suggestion.content, // Native stays in nativeContent
                content: suggestion.englishContent, // English in content
                language: language,
                llmModel: modelUsed
              };
            } else {
              // If no English provided yet, keep native in content for now
              // Translation step will fix this later
              return {
                ...suggestion,
                language: language,
                llmModel: modelUsed
              };
            }
          }
          return { ...suggestion, llmModel: modelUsed };
        });
      }
      
      // Translate non-English scripts to English for compliance audit
      if (isMultilingual && suggestions.length > 0) {
        console.log('Starting translation of non-English scripts for compliance audit');
        suggestions = await this.translateToEnglish(suggestions, language);
        console.log('Translation complete. Scripts now have both native and English versions');
      }
      
      let voiceGenerated = false;

      // Generate voice recordings if requested and ElevenLabs is configured
      if (includeVoice && elevenLabsService.isConfigured()) {
        console.log('Starting voice generation for', suggestions.length, 'suggestions');
        try {
          // Pass language information for multilingual voice generation
          suggestions = await elevenLabsService.generateScriptVoiceovers(
            suggestions,
            voiceId,
            language // Pass the language code for proper voice selection
          );
          voiceGenerated = true;
          console.log('Voice generation completed. Suggestions now have audioUrl:', suggestions.some(s => s.audioUrl));
        } catch (error) {
          console.error('Error generating voice recordings:', error);
          // Continue without voice - don't fail the entire operation
        }
      } else {
        console.log('Voice generation skipped. includeVoice:', includeVoice, 'isConfigured:', elevenLabsService.isConfigured());
      }

      return {
        suggestions,
        message: 'Successfully generated script suggestions using Guidance Primer',
        voiceGenerated
      };
    } catch (error) {
      console.error("Error generating script suggestions:", error);
      throw error;
    }
  }

  /**
   * Generate iterations/variations of existing scripts
   */
  async generateIterations(
    sourceScripts: any[],
    options: {
      iterationsPerScript?: number;
      voiceId?: string;
      includeVoice?: boolean;
      guidancePrompt?: string;
      language?: string;
      primerContent?: string;
      experimentalPercentage?: number;
      individualGeneration?: boolean;
      llmProvider?: LLMProvider;
    } = {}
  ): Promise<{
    suggestions: ScriptSuggestion[];
    message: string;
    voiceGenerated?: boolean;
  }> {
    const {
      iterationsPerScript = 3,
      voiceId,
      includeVoice = false,
      guidancePrompt,
      language = 'en',
      primerContent,
      experimentalPercentage = 50,
      individualGeneration = false,
      llmProvider = 'openai'
    } = options;

    try {
      const targetLanguage = this.getLanguageName(language);
      const isMultilingual = language !== 'en';
      console.log(`Generating ${iterationsPerScript} iterations per script in ${targetLanguage}`);

      // Build the creative inspiration section
      const creativeInspirationSection = guidancePrompt ? guidancePrompt.trim() : '';

      const prompt = `OBJECTIVE
You are a copywriter specializing in writing creative iterations of successful advertising scripts for video ads to run on Meta social platforms.
Your objective is to take proven winning scripts and create iterations that will perform better than the original script against the goal of the user downloading the what3words app and then going on to do a key what3words metric action.

CONSTRAINTS (ALL LANGUAGES):
Never mention a rooftop or similar, as what3words doesn't work vertically
Because a what3words square is 3m x 3m, use '3 meter square' (or similar) if referring to area and never '3 meter squared' which is the incorrect area.
Never mention or show any specific or example what3words address itself
The app name "what three words" should always appear in every ad, and it should always be written exactly like that, and only written in English (never localised).
Other than the phrase "what three words", don't use any language other than the selected script language for the script.

CONSTRAINTS (ENGLISH LANGUAGE SCRIPTS):
A what three words location can only be written as "what three words address", "what three words location", "three word code", "three word address", or "three word identifier"

NON-ENGLISH LANGUAGE SPECIFIC CONSTRAINTS (when requested script language does not equal 'English'):
Never include the English translation within the script
Don't mention the app name "what three words" more than once in a single voiceover script ad (because the brand name is not localisable)

${creativeInspirationSection ? `CREATIVE INSPIRATION:\nIncorporate the following thematic guidance into your iterations:\n${creativeInspirationSection}\n` : ''}

TASK:
For each source script provided below, write ${iterationsPerScript} creative iterations.
Each iteration can explore different CTA's, openings and other optimisation opportunities. 
However, the source script is already a winning script. Therefore iteration differences should be subtle, ensuring that the core message and product benefits/use cases of the source script are retained. Follow all the constraints listed above

${isMultilingual ? `IMPORTANT: Write all iterations NATIVELY in ${targetLanguage}. Think and create in ${targetLanguage} first - DO NOT translate from English. After creating the ${targetLanguage} versions, provide English translations for compliance review.\n` : ''}

OUTPUT FORMAT (strict JSON):
{
  "suggestions": [
    {
      "title": "Brief creative title",
      "content": "${isMultilingual ? `Native ${targetLanguage} voiceover script` : 'Complete English voiceover script'}",
      ${isMultilingual ? `"englishContent": "English translation for compliance review",\n      ` : ''}"reasoning": "Explain what creative approach this iteration takes and how it differs from the source",
      "sourceScriptTitle": "Title of the source script",
      "sourceScript": "The original script content this is based on"
    }
  ]
}`;

      let allSuggestions: ScriptSuggestion[] = [];

      if (individualGeneration) {
        // Individual generation: One API call per source script
        console.log(`Individual generation mode: ${sourceScripts.length} API calls (${iterationsPerScript} iterations each) using ${llmProvider}`);

        const systemPrompt = isMultilingual
          ? `You are a multilingual creative director fluent in ${targetLanguage}. You think and create NATIVELY in ${targetLanguage}.`
          : undefined;

        const reasoningMap: { [key: string]: 'low' | 'medium' | 'high' } = {
          high: 'high',
          medium: 'medium',
          low: 'low'
        };
        const reasoningLevel = experimentalPercentage > 70 ? 'high' : experimentalPercentage > 30 ? 'medium' : 'low';

        const apiCalls = sourceScripts.map((sourceScript, scriptIndex) => {
          const scriptPrompt = `${prompt}\n\nSOURCE SCRIPT TO ITERATE:\n"${sourceScript.content || sourceScript.nativeContent}"\n\nGenerate ${iterationsPerScript} creative variations of this script.`;

          return generateJsonResponse(llmProvider, {
            prompt: scriptPrompt,
            systemPrompt,
            reasoningEffort: reasoningLevel,
          });
        });

        const responses = await Promise.all(apiCalls);

        responses.forEach((llmResponse, scriptIndex) => {
          const result = llmResponse.parsed;
          const modelUsed = llmResponse.model;
          if (result.suggestions && Array.isArray(result.suggestions)) {
            const sourceScript = sourceScripts[scriptIndex];
            result.suggestions.forEach((suggestion: any, iterIndex: number) => {
              allSuggestions.push({
                ...suggestion,
                fileName: `${sourceScript.scriptTitle || `source${scriptIndex + 1}`}_iter${iterIndex + 1}`,
                sourceScriptTitle: sourceScript.scriptTitle || sourceScript.title || `Script ${scriptIndex + 1}`,
                sourceScript: sourceScript.content || sourceScript.nativeContent,
                llmModel: modelUsed
              });
            });
          }
        });

        console.log(`Individual generation complete: ${allSuggestions.length} iterations generated using ${llmProvider}`);
      } else {
        // Batch generation: Single API call for all iterations
        console.log(`Batch generation mode: Single API call for all ${sourceScripts.length} scripts using ${llmProvider}`);

        const scriptsToIterate = sourceScripts.map((script, index) => ({
          index,
          content: script.content || script.nativeContent
        }));

        const batchPrompt = `${prompt}\n\nSOURCE SCRIPTS TO ITERATE:\n${JSON.stringify(scriptsToIterate, null, 2)}\n\nFor each source script, generate ${iterationsPerScript} creative variations (total ${sourceScripts.length * iterationsPerScript} iterations).`;

        const systemPrompt = isMultilingual
          ? `You are a multilingual creative director fluent in ${targetLanguage}. You think and create NATIVELY in ${targetLanguage}.`
          : undefined;

        const reasoningLevel = experimentalPercentage > 70 ? 'high' : experimentalPercentage > 30 ? 'medium' : 'low';

        const llmResponse = await generateJsonResponse(llmProvider, {
          prompt: batchPrompt,
          systemPrompt,
          reasoningEffort: reasoningLevel as 'low' | 'medium' | 'high',
        });

        const result = llmResponse.parsed;
        const modelUsed = llmResponse.model;

        if (result.suggestions && Array.isArray(result.suggestions)) {
          // Map each suggestion back to its source script using the index
          let suggestionCounter = 0;
          result.suggestions.forEach((suggestion: any) => {
            // Determine which source script this iteration belongs to
            const sourceScriptIndex = Math.floor(suggestionCounter / iterationsPerScript);
            const sourceScript = sourceScripts[sourceScriptIndex];
            const iterationNumber = (suggestionCounter % iterationsPerScript) + 1;
            
            allSuggestions.push({
              ...suggestion,
              fileName: `${sourceScript.scriptTitle || `source${sourceScriptIndex + 1}`}_iter${iterationNumber}`,
              sourceScriptTitle: sourceScript.scriptTitle || sourceScript.title || `Script ${sourceScriptIndex + 1}`,
              sourceScript: sourceScript.content || sourceScript.nativeContent,
              llmModel: modelUsed
            });
            
            suggestionCounter++;
          });
        }

        console.log(`Batch generation complete: ${allSuggestions.length} iterations generated (model: ${modelUsed})`);
      }

      // Process multilingual responses
      let suggestions = allSuggestions.map((suggestion: any) => {
        if (isMultilingual) {
          if (suggestion.englishContent) {
            return {
              ...suggestion,
              nativeContent: suggestion.content,
              content: suggestion.englishContent,
              language: language
            };
          } else {
            return {
              ...suggestion,
              language: language
            };
          }
        }
        return suggestion;
      });

      // Translate non-English iterations to English for compliance
      if (isMultilingual && suggestions.length > 0) {
        console.log('Starting translation of non-English iterations');
        suggestions = await this.translateToEnglish(suggestions, language);
        console.log('Translation complete');
      }

      let voiceGenerated = false;

      // Generate voice recordings if requested
      if (includeVoice && elevenLabsService.isConfigured()) {
        console.log('Starting voice generation for', suggestions.length, 'iterations');
        try {
          suggestions = await elevenLabsService.generateScriptVoiceovers(
            suggestions,
            voiceId,
            language
          );
          voiceGenerated = true;
          console.log('Voice generation completed');
        } catch (error) {
          console.error('Error generating voice recordings:', error);
        }
      }

      return {
        suggestions,
        message: `Successfully generated ${suggestions.length} script iterations`,
        voiceGenerated
      };
    } catch (error) {
      console.error("Error generating script iterations:", error);
      throw error;
    }
  }

  /**
   * Translate non-English scripts to English for compliance audit
   */
  private async translateToEnglish(
    scripts: ScriptSuggestion[],
    sourceLanguage: string
  ): Promise<ScriptSuggestion[]> {
    try {
      const sourceLanguageName = this.getLanguageName(sourceLanguage);
      console.log(`Translating ${scripts.length} scripts from ${sourceLanguageName} to English for compliance audit`);

      // Check if any scripts already have English translations - if so, skip translation
      const needsTranslation = scripts.some(s => !s.nativeContent || s.nativeContent === s.content);
      if (!needsTranslation) {
        console.log('All scripts already have translations, skipping API call');
        return scripts;
      }

      // For scripts that have nativeContent already, use that as source
      // Otherwise use content field as the native source
      const scriptsToTranslate = scripts.map((s, index) => ({
        index,
        title: s.title,
        content: s.nativeContent || s.content  // Use nativeContent if available, otherwise content
      }));

      const translationPrompt = `You are an advertising script translator and compliance auditor.

Goal: Localise ad copy into English for creative review. You should remain faithful to the original sentiment and meaning. For example, find an English equivalent of an expression that would sound odd (or not what is meant in the original language) in English if translated literally.

Rules:
- Preserve brand/product "what three words" verbatim
- Do not optimize, shorten, or improve the copy
- Keep any slang, profanity, or edgy claims, as we would want to review these

Source Language: ${sourceLanguageName}

Scripts to translate:
${JSON.stringify(scriptsToTranslate, null, 2)}

Output format (JSON):
{
  "translations": [
    {
      "index": 0,
      "englishTranslation": "Complete English translation of script",
      "notableAdjustments": "Any notable turns of phrase (cite local and EN text and brief summary of original meaning) which particularly deviate from the literal translation"
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "user",
            content: translationPrompt
          }
        ],
        response_format: { type: "json_object" },
        reasoning_effort: "low" // Translation doesn't need high reasoning
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      if (!result.translations || !Array.isArray(result.translations)) {
        console.error("Invalid translation response format");
        return scripts;
      }

      // Map translations back to original scripts
      const translationMap = new Map<number, { englishTranslation: string; notableAdjustments?: string }>();
      result.translations.forEach((t: any) => {
        translationMap.set(t.index, { 
          englishTranslation: t.englishTranslation,
          notableAdjustments: t.notableAdjustments 
        });
      });

      // Update scripts with English translations
      return scripts.map((script, index) => {
        const translationData = translationMap.get(index);
        if (translationData) {
          // Preserve the original native content
          const nativeText = script.nativeContent || script.content;
          return {
            ...script,
            nativeContent: nativeText, // Keep the original native text
            content: translationData.englishTranslation, // English translation for compatibility
            notableAdjustments: translationData.notableAdjustments, // Translation notes
            language: sourceLanguage
          };
        }
        return script;
      });

    } catch (error) {
      console.error("Error translating scripts to English:", error);
      // Return original scripts if translation fails
      return scripts;
    }
  }

  /**
   * Save generated suggestions back to Google Sheets
   */
  async saveSuggestionsToSheet(
    spreadsheetId: string,
    suggestions: ScriptSuggestion[],
    tabName: string = "New Scripts",
    guidancePrompt: string = "",
  ): Promise<void> {
    try {
      const cleanSpreadsheetId =
        googleSheetsService.extractSpreadsheetId(spreadsheetId);

      // Create timestamped tab name
      const now = new Date();
      const timestamp = now.toLocaleString('en-CA', { 
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).replace(',', '');
      const timestampedTabName = `${tabName} ${timestamp}`;

      // Prepare data for sheets
      const headers = [
        "Generated Date",
        "File Title", 
        "Script Title",
        "Recording Language",
        "Native Language Script",
        "English Script",
        "Translation Notes",
        "AI Reasoning",
        "LLM Model",
        "Source Script Title",
        "Source Script Copy",
      ];
      const generatedDate = new Date().toISOString().split("T")[0];

      const rows = suggestions.map((suggestion, index) => {
        // Generate file title with script numbering and safe formatting
        const safeTitle = suggestion.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 40);
        const fileTitle = `script${index + 1}_${safeTitle}_${Date.now()}`;
        
        // Get language name from code
        const languageName = suggestion.language ? this.getLanguageName(suggestion.language) : 'English';
        
        return [
          generatedDate,
          fileTitle,
          suggestion.title,
          languageName, // Recording Language
          suggestion.nativeContent || suggestion.content, // Native Language Script (or English if not multilingual)
          suggestion.content, // English Script (always the English version or translation)
          suggestion.notableAdjustments || '', // Translation notes (empty if none)
          suggestion.reasoning,
          suggestion.llmModel || '', // LLM Model used
          suggestion.sourceScriptTitle || '', // Source Script Title
          suggestion.sourceScript || '', // Source Script Copy
        ];
      });

      // Create the tab and add headers
      await googleSheetsService.createTab(cleanSpreadsheetId, timestampedTabName, headers);

      // Add data to the tab
      await googleSheetsService.appendDataToTab(cleanSpreadsheetId, timestampedTabName, rows);

      console.log(
        `Saved ${suggestions.length} suggestions to sheet tab "${timestampedTabName}"`,
      );

      // Also write to ScriptDatabase tab (IDs are auto-generated sequentially)
      const scriptDatabaseEntries = suggestions.map((suggestion) => {
        // Use ISO 639-1 language code (e.g., 'en', 'hi', 'es') - capitalize first letter
        const langCode = suggestion.language || 'en';
        const formattedCode = langCode.charAt(0).toUpperCase() + langCode.slice(1).toLowerCase();
        
        return {
          language: formattedCode,
          scriptCopy: suggestion.nativeContent || suggestion.content,
          aiPrompt: guidancePrompt,
          aiModel: suggestion.llmModel || '',
        };
      });

      await googleSheetsService.appendToScriptDatabase(cleanSpreadsheetId, scriptDatabaseEntries);
      console.log(`Also saved ${suggestions.length} scripts to ScriptDatabase tab`);

    } catch (error) {
      console.error("Error saving suggestions to Google Sheets:", error);
      throw error;
    }
  }
}

export const aiScriptService = new AIScriptService();
