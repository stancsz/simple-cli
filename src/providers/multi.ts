/**
 * Multi-Provider: Manages multiple LLM models for MoE routing via LiteLLM
 * Each tier can use a different model from any provider
 */

import { createProviderForModel, type Provider, type Message } from './index.js';
import type { Tier, TierConfig } from '../router.js';
import type { TypeLLMResponse } from '../lib/typellm.js';

export interface MultiProvider {
  getProvider: (tier: Tier) => Provider;
  generateWithTier: (tier: Tier, systemPrompt: string, messages: Message[]) => Promise<TypeLLMResponse>;
}

// Create multi-provider system using LiteLLM
export const createMultiProvider = (tierConfigs: Map<Tier, TierConfig>): MultiProvider => {
  const providerCache = new Map<Tier, Provider>();

  const getProvider = (tier: Tier): Provider => {
    const cached = providerCache.get(tier);
    if (cached) return cached;

    const config = tierConfigs.get(tier);
    if (!config) {
      throw new Error(`No configuration for tier ${tier}`);
    }

    const provider = createProviderForModel(config.model);
    providerCache.set(tier, provider);
    return provider;
  };

  return {
    getProvider,
    generateWithTier: async (tier: Tier, systemPrompt: string, messages: Message[]): Promise<TypeLLMResponse> => {
      const provider = getProvider(tier);
      return provider.generateResponse(systemPrompt, messages);
    }
  };
};
