/**
 * Provider Bridge: Unified LLM interface via Vercel AI SDK
 * Support for OpenAI, Anthropic, Google (Gemini), and custom endpoints.
 */
import { createTypeLLM, type TypeLLM as TypeLLMInstance, type TypeLLMConfig } from '@stancsz/typellm';

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
        undefined,
    temperature: 0
  });

  return {
    name: providerType,
    model: actualModel,
    generateResponse: async (systemPrompt: string, messages: Message[]): Promise<string> => {
      try {
        const response = await llm.generate(systemPrompt, messages);

        // Return normalized JSON string for CLI to parse
        const normalized = JSON.stringify({
          thought: response.thought,
          tool: response.tool,
          args: response.args,
          message: response.message
        });

        console.log(`[DEBUG] TypeLLM Response: ${normalized.substring(0, 300)}...`);
        return normalized;
      } catch (e) {
        return `Error calling TypeLLM: ${e instanceof Error ? e.message : e}`;
      }
    }
  };
};

/**
 * Creates the default provider
 */
export const createProvider = (): Provider => {
  const model = process.env.OPENAI_MODEL || process.env.GEMINI_MODEL || 'gpt-4o-mini';
  console.log(`🤖 Using TypeLLM with model: ${model}`);
  return createProviderForModel(model);
};
