import OpenAI from "openai";
import Groq from "groq-sdk";
import { GoogleGenAI } from "@google/genai";

export type LLMProvider = 'openai' | 'groq' | 'gemini';

export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export interface LLMResponse {
  content: string;
  parsed: any;
  provider: LLMProvider;
  model: string;
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

let groqClient: Groq | null = null;
function getGroqClient(): Groq {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY environment variable is not set');
    }
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    if (!process.env.AI_INTEGRATIONS_GEMINI_API_KEY || !process.env.AI_INTEGRATIONS_GEMINI_BASE_URL) {
      throw new Error('Gemini AI Integrations environment variables are not set');
    }
    geminiClient = new GoogleGenAI({
      apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
      httpOptions: {
        apiVersion: "",
        baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
      },
    });
  }
  return geminiClient;
}

function parseJsonResponse(content: string): any {
  try {
    return JSON.parse(content);
  } catch (e) {
    let cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      console.error('Failed to parse JSON response:', content.substring(0, 500));
      throw new Error('Failed to parse LLM response as JSON');
    }
  }
}

async function generateWithOpenAI(request: LLMRequest): Promise<LLMResponse> {
  const model = "gpt-5.1";
  
  const temperatureMap = {
    'low': 0.3,
    'medium': 0.5,
    'high': 0.7
  };
  const temperature = temperatureMap[request.reasoningEffort || 'medium'];
  
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "user",
        content: request.systemPrompt 
          ? `${request.systemPrompt}\n\n${request.prompt}`
          : request.prompt,
      },
    ],
    response_format: { type: "json_object" },
    temperature,
  });

  const content = response.choices[0].message.content || "{}";
  
  return {
    content,
    parsed: parseJsonResponse(content),
    provider: 'openai',
    model,
  };
}

async function generateWithGroq(request: LLMRequest): Promise<LLMResponse> {
  const groq = getGroqClient();
  const model = "llama-3.3-70b-versatile";
  
  const temperatureMap = {
    'low': 0.3,
    'medium': 0.5,
    'high': 0.7
  };
  const temperature = temperatureMap[request.reasoningEffort || 'medium'];

  const response = await groq.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are a JSON-only response assistant. Always respond with valid JSON only, no additional text or markdown formatting."
      },
      {
        role: "user",
        content: request.systemPrompt 
          ? `${request.systemPrompt}\n\n${request.prompt}`
          : request.prompt,
      },
    ],
    temperature,
    max_tokens: request.maxTokens || 8192,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0].message.content || "{}";
  
  return {
    content,
    parsed: parseJsonResponse(content),
    provider: 'groq',
    model,
  };
}

async function generateWithGemini(request: LLMRequest): Promise<LLMResponse> {
  const ai = getGeminiClient();
  const model = "gemini-3-pro-preview";

  const fullPrompt = request.systemPrompt 
    ? `${request.systemPrompt}\n\n${request.prompt}`
    : request.prompt;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ text: fullPrompt }],
      },
    ],
    config: {
      responseMimeType: "application/json",
    },
  });

  let content = "{}";
  if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
    content = response.candidates[0].content.parts[0].text;
  } else if (response.text) {
    content = response.text || "{}";
  }
  
  return {
    content,
    parsed: parseJsonResponse(content),
    provider: 'gemini',
    model,
  };
}

export async function generateJsonResponse(
  provider: LLMProvider,
  request: LLMRequest
): Promise<LLMResponse> {
  console.log(`[LLM Service] Using provider: ${provider}`);
  
  switch (provider) {
    case 'openai':
      return generateWithOpenAI(request);
    case 'groq':
      return generateWithGroq(request);
    case 'gemini':
      return generateWithGemini(request);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

export function isProviderAvailable(provider: LLMProvider): boolean {
  switch (provider) {
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'groq':
      return !!process.env.GROQ_API_KEY;
    case 'gemini':
      return !!process.env.AI_INTEGRATIONS_GEMINI_API_KEY && !!process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
    default:
      return false;
  }
}

export function getAvailableProviders(): { id: string; name: string; available: boolean; model: string }[] {
  return [
    { id: 'openai', name: 'OpenAI', available: isProviderAvailable('openai'), model: 'GPT-5.1' },
    { id: 'groq', name: 'Groq', available: isProviderAvailable('groq'), model: 'Llama 3.3 70B' },
    { id: 'gemini', name: 'Gemini', available: isProviderAvailable('gemini'), model: 'Gemini 3 Pro' },
  ];
}
