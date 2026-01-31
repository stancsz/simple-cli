/**
 * Provider Bridge: Unified LLM interface via OpenAI SDK
 * Supports OpenAI, DeepSeek, Groq, and other OpenAI-compatible endpoints.
 */

import OpenAI from 'openai';

export interface Message {
  role: string;
  content: string;
}

export interface Provider {
  name: string;
  model: string;
  generateResponse: (systemPrompt: string, messages: Message[]) => Promise<string>;
}

// Configuration for different providers
interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
}

const getProviderConfig = (): ProviderConfig => {
  // 1. OpenAI (Default)
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-5-mini'
    };
  }
  // 2. DeepSeek
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat'
    };
  }
  // 3. Groq
  if (process.env.GROQ_API_KEY) {
    return {
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL || 'llama3-70b-8192'
    };
  }
  // 4. Mistral
  if (process.env.MISTRAL_API_KEY) {
    return {
      apiKey: process.env.MISTRAL_API_KEY,
      baseURL: 'https://api.mistral.ai/v1',
      model: process.env.MISTRAL_MODEL || 'mistral-large-latest'
    };
  }

  throw new Error('No supported API key found (OPENAI_API_KEY, DEEPSEEK_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY)');
};

export const createProviderForModel = (model: string): Provider => {
  // Quick heuristic to determine provider for specific model overrides
  // logic can be improved, but this assumes the environment variables set the *default* linkage
  // If a specific model is requested (e.g. for MoE), we try to route it.

  let config = getProviderConfig();

  // Override config if model implies a different provider? 
  // For the sake of "Simple-CLI", we assume the default connected provider serves the requested model
  // or we just use OpenAI SDK's flexibility.

  if (model.includes('gpt')) config = { ...config, apiKey: process.env.OPENAI_API_KEY, baseURL: undefined };
  else if (model.includes('deepseek')) config = { ...config, apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' };

  if (!config.apiKey) throw new Error(`Cannot route for model ${model} - missing API key`);

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });

  return {
    name: 'openai-compatible',
    model,
    generateResponse: async (systemPrompt: string, messages: Message[]): Promise<string> => {
      try {
        const response = await client.chat.completions.create({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content }))
          ]
        });
        return response.choices[0]?.message?.content || '';
      } catch (e) {
        return `Error calling LLM: ${e instanceof Error ? e.message : e}`; // Fail gracefully
      }
    }
  };
};

export const createProvider = (): Provider => {
  const config = getProviderConfig();
  console.log(`🤖 Using model: ${config.model}`);
  return createProviderForModel(config.model);
};
