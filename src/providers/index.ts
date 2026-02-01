/**
 * Provider Bridge: Unified LLM interface via Vercel AI SDK
 * Support for OpenAI, Anthropic, Google (Gemini), and custom endpoints.
 */
import { generateText } from 'ai';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Provider {
  name: string;
  model: string;
  generateResponse: (systemPrompt: string, messages: Message[]) => Promise<string>;
}

/**
 * Creates a Vercel AI SDK compatible provider instance
 */
export const createProviderForModel = (modelId: string): Provider => {
  let modelInstance: any;

  // Handle provider selection
  if (modelId.startsWith('anthropic:') || (process.env.ANTHROPIC_API_KEY && modelId.startsWith('claude'))) {
    const actualModel = modelId.startsWith('anthropic:') ? modelId.split(':')[1] : modelId;
    modelInstance = anthropic(actualModel);
  } else if (modelId.startsWith('google:') || (process.env.GOOGLE_GENERATIVE_AI_API_KEY && modelId.startsWith('gemini'))) {
    const actualModel = modelId.startsWith('google:') ? modelId.split(':')[1] : modelId;
    modelInstance = google(actualModel);
  } else {
    // Default to OpenAI / OpenAI-compatible
    const actualModel = modelId.startsWith('openai:') ? modelId.split(':')[1] : modelId;

    // Support custom baseURL (for LiteLLM Proxy or similar)
    if (process.env.LITELLM_BASE_URL) {
      const customOpenai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.LITELLM_BASE_URL,
      });
      modelInstance = customOpenai(actualModel);
    } else {
      modelInstance = openai(actualModel);
    }
  }

  return {
    name: 'vercel-ai-sdk',
    model: modelId,
    generateResponse: async (systemPrompt: string, messages: Message[]): Promise<string> => {
      try {
        const { text } = await generateText({
          model: modelInstance,
          system: systemPrompt,
          messages: messages as any,
        });
        return text;
      } catch (e) {
        return `Error calling AI model: ${e instanceof Error ? e.message : e}`;
      }
    }
  };
};

/**
 * Creates the default provider based on environment config
 */
export const createProvider = (): Provider => {
  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';
  console.log(`🤖 Using Vercel AI SDK with model: ${model}`);
  return createProviderForModel(model);
};
