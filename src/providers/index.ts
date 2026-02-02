/**
 * Provider Bridge: Unified LLM interface via Vercel AI SDK
 * Support for OpenAI, Anthropic, Google (Gemini), and custom endpoints.
 */
import { createTypeLLM, type TypeLLM as TypeLLMInstance, type TypeLLMConfig, type TypeLLMResponse } from '@stan-chen/typellm';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface Provider {
  name: string;
  model: string;
  generateResponse: (systemPrompt: string, messages: Message[]) => Promise<TypeLLMResponse>;
}

/**
 * Structured output strategy:
 * - Uses strong system prompts with explicit JSON format examples
 * - Response parsing with jsonrepair (in cli.ts)
 * - Format reminders in user messages (in context.ts)
 * 
 * This approach works across ALL providers without hitting
 * provider-specific schema limitations (e.g., OpenAI's additionalProperties requirement)
 */

/**
 * Creates a provider instance using TypeLLM
 */
export const createProviderForModel = (modelId: string): Provider => {
  let providerType: 'openai' | 'google' | 'anthropic' | 'litellm' = 'openai';
  let actualModel = modelId;
  let baseURL: string | undefined;

  // Handle provider selection
  if (modelId.startsWith('anthropic:')) {
    actualModel = modelId.split(':')[1] || modelId;
    providerType = 'anthropic';
  } else if (modelId.startsWith('google:') || modelId.startsWith('gemini:')) {
    actualModel = modelId.split(':')[1] || modelId;
    providerType = 'google';
  } else if (modelId.startsWith('openai:')) {
    actualModel = modelId.split(':')[1] || modelId;
    providerType = 'openai';
  } else if (modelId.startsWith('claude') || (process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY)) {
    providerType = 'anthropic';
  } else if (modelId.startsWith('gemini') || (process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY)) {
    providerType = 'google';
  } else if (process.env.LITELLM_BASE_URL) {
    providerType = 'litellm';
    baseURL = process.env.LITELLM_BASE_URL;
  } else {
    providerType = 'openai';
  }

  // Final check for the Google key mapping
  if (providerType === 'google' && process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GEMINI_API_KEY;
  }

  const llm = createTypeLLM({
    provider: providerType,
    model: actualModel,
    baseURL: baseURL,
    apiKey: providerType === 'openai' ? process.env.OPENAI_API_KEY :
      providerType === 'google' ? process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY :
        providerType === 'anthropic' ? process.env.ANTHROPIC_API_KEY :
          undefined,
    temperature: 0
  });

  return {
    name: providerType,
    model: actualModel,
    generateResponse: async (systemPrompt: string, messages: Message[]): Promise<TypeLLMResponse> => {
      try {
        const response = await llm.generate(systemPrompt, messages);
        console.log(`[DEBUG] TypeLLM Response: ${JSON.stringify(response).substring(0, 300)}...`);
        // Return a string for compatibility with tests that expect textual output
        if (response && typeof response === 'object') {
          return (response.message && response.message.length > 0) ? String(response.message) : JSON.stringify(response);
        }
        return String(response);
      } catch (e) {
        const msg = `Error calling TypeLLM: ${e instanceof Error ? e.message : e}`;
        return msg;
      }
    }
  };
};

/**
 * Creates the default provider
 */
export const createProvider = (): Provider => {
  const isClaw = process.argv.includes('--claw') || process.argv.includes('-claw');
  const model = (isClaw ? process.env.CLAW_MODEL : null) || process.env.OPENAI_MODEL || process.env.GEMINI_MODEL || 'gpt-4o-mini';
  console.log(`🤖 Using TypeLLM with model: ${model}`);
  return createProviderForModel(model);
};
