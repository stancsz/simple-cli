/**
 * Provider Bridge: Unified LLM interface via Vercel AI SDK
 * Support for OpenAI, Anthropic, Google (Gemini), and custom endpoints.
 */
import { createAnyLLM, type AnyLLM as AnyLLMInstance, type AnyLLMConfig, type AnyLLMResponse } from '../lib/anyllm.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Provider {
  name: string;
  model: string;
  generateResponse: (systemPrompt: string, messages: Message[]) => Promise<AnyLLMResponse>;
}

/**
 * Creates a provider instance using AnyLLM
 */
export const createProviderForModel = (modelId: string): Provider => {
  let providerType: string = 'openai';
  let actualModel = modelId;
  let baseURL: string | undefined;

  // Handle provider selection
  if (modelId.startsWith('anthropic:')) {
    actualModel = modelId.split(':')[1] || modelId;
    providerType = 'anthropic';
  } else if (modelId.startsWith('google:') || modelId.startsWith('gemini:')) {
    actualModel = modelId.split(':')[1] || modelId;
    providerType = 'gemini';
  } else if (modelId.startsWith('openai:')) {
    actualModel = modelId.split(':')[1] || modelId;
    providerType = 'openai';
  } else if (modelId.startsWith('claude') || (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY)) {
    providerType = 'anthropic';
  } else if (modelId.startsWith('gemini') || (process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY)) {
    providerType = 'gemini';
  } else if (process.env.LITELLM_BASE_URL) {
    providerType = 'litellm';
    baseURL = process.env.LITELLM_BASE_URL;
  } else {
    providerType = 'openai';
  }

  // Final check for the Google key mapping
  if (providerType === 'gemini' && process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
  }

  const llm = createAnyLLM({
    provider: providerType,
    model: actualModel,
    baseURL: baseURL,
    apiKey: providerType === 'openai' ? process.env.OPENAI_API_KEY :
      providerType === 'gemini' ? process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY :
        providerType === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
          undefined,
    temperature: 0
  });

  return {
    name: providerType,
    model: actualModel,
    generateResponse: async (systemPrompt: string, messages: Message[]): Promise<AnyLLMResponse> => {
      try {
        const response = await llm.generate(systemPrompt, messages);
        if ((process.env.DEBUG === 'true') && response) console.log(`[DEBUG] AnyLLM Response: ${JSON.stringify(response).substring(0, 300)}...`);
        return response;
      } catch (e) {
        const msg = `Error calling AnyLLM: ${e instanceof Error ? e.message : e}`;
        return {
          thought: 'Error occurred during generation',
          tool: 'none',
          args: {},
          message: msg,
          raw: msg
        };
      }
    }
  };
};

/**
 * Creates the default provider
 */
export const createProvider = (): Provider => {
  const model = process.env.OPENAI_MODEL || process.env.GEMINI_MODEL || 'gpt-5-mini'; // Default to simple
  console.log(`🤖 Using AnyLLM with model: ${model}`);
  return createProviderForModel(model);
};
