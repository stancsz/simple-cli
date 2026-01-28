/**
 * Tests for provider module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock litellm before importing providers
vi.mock('litellm', () => ({
  completion: vi.fn()
}));

import { createProvider, createProviderForModel } from '../src/providers/index.js';
import { createMultiProvider } from '../src/providers/multi.js';
import { loadTierConfig } from '../src/router.js';
import { completion } from 'litellm';

describe('providers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createProviderForModel', () => {
    it('should create provider with specified model', () => {
      const provider = createProviderForModel('gpt-4o');

      expect(provider.model).toBe('gpt-4o');
      expect(provider.name).toBe('openai');
    });

    it('should extract provider name from model with prefix', () => {
      const provider = createProviderForModel('anthropic/claude-3-opus');

      expect(provider.name).toBe('anthropic');
      expect(provider.model).toBe('anthropic/claude-3-opus');
    });

    it('should call litellm completion with correct parameters', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Hello!' } }]
      };
      vi.mocked(completion).mockResolvedValue(mockResponse as any);

      const provider = createProviderForModel('gpt-4o');
      const result = await provider.generateResponse(
        'You are helpful',
        [{ role: 'user', content: 'Hi' }]
      );

      expect(completion).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi' }
        ],
        max_tokens: 4096
      });
      expect(result).toBe('Hello!');
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        choices: [{ message: { content: '' } }]
      };
      vi.mocked(completion).mockResolvedValue(mockResponse as any);

      const provider = createProviderForModel('gpt-4o');
      const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('');
    });

    it('should handle missing content in response', async () => {
      const mockResponse = {
        choices: [{ message: {} }]
      };
      vi.mocked(completion).mockResolvedValue(mockResponse as any);

      const provider = createProviderForModel('gpt-4o');
      const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('');
    });
  });

  describe('createProvider', () => {
    it('should detect Anthropic when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const provider = createProvider();

      expect(provider.model).toContain('claude');
    });

    it('should detect OpenAI when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const provider = createProvider();

      expect(provider.model).toContain('gpt');
    });

    it('should detect Gemini when GOOGLE_API_KEY is set', () => {
      process.env.GOOGLE_API_KEY = 'test-key';
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const provider = createProvider();

      expect(provider.model).toContain('gemini');
    });

    it('should throw error when no API key is set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;
      delete process.env.MISTRAL_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;

      expect(() => createProvider()).toThrow('No API key found');
    });

    it('should use custom model from environment', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_MODEL = 'gpt-4-turbo';

      const provider = createProvider();

      expect(provider.model).toBe('gpt-4-turbo');
    });
  });

  describe('createMultiProvider', () => {
    it('should create multi-provider with tier configs', () => {
      const tierConfigs = loadTierConfig();
      const multiProvider = createMultiProvider(tierConfigs);

      expect(multiProvider.getProvider).toBeDefined();
      expect(multiProvider.generateWithTier).toBeDefined();
    });

    it('should return correct provider for each tier', () => {
      const tierConfigs = loadTierConfig();
      const multiProvider = createMultiProvider(tierConfigs);

      const tier1Provider = multiProvider.getProvider(1);
      const tier3Provider = multiProvider.getProvider(3);

      expect(tier1Provider).toBeDefined();
      expect(tier3Provider).toBeDefined();
    });

    it('should throw error for invalid tier', () => {
      const tierConfigs = loadTierConfig();
      const multiProvider = createMultiProvider(tierConfigs);

      expect(() => multiProvider.getProvider(10 as any)).toThrow();
    });

    it('should cache providers', () => {
      const tierConfigs = loadTierConfig();
      const multiProvider = createMultiProvider(tierConfigs);

      const provider1 = multiProvider.getProvider(1);
      const provider1Again = multiProvider.getProvider(1);

      expect(provider1).toBe(provider1Again);
    });

    it('should generate response with specified tier', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Tier response' } }]
      };
      vi.mocked(completion).mockResolvedValue(mockResponse as any);

      const tierConfigs = loadTierConfig();
      const multiProvider = createMultiProvider(tierConfigs);

      const result = await multiProvider.generateWithTier(
        2,
        'System prompt',
        [{ role: 'user', content: 'Hello' }]
      );

      expect(result).toBe('Tier response');
      expect(completion).toHaveBeenCalled();
    });
  });

  describe('conversation handling', () => {
    it('should handle multi-turn conversations', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Response 2' } }]
      };
      vi.mocked(completion).mockResolvedValue(mockResponse as any);

      const provider = createProviderForModel('gpt-4o');
      await provider.generateResponse('System', [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' }
      ]);

      expect(completion).toHaveBeenCalledWith(expect.objectContaining({
        messages: expect.arrayContaining([
          { role: 'system', content: 'System' },
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
          { role: 'user', content: 'Second message' }
        ])
      }));
    });

    it('should handle empty conversation history', async () => {
      const mockResponse = {
        choices: [{ message: { content: 'Response' } }]
      };
      vi.mocked(completion).mockResolvedValue(mockResponse as any);

      const provider = createProviderForModel('gpt-4o');
      await provider.generateResponse('System', []);

      expect(completion).toHaveBeenCalledWith(expect.objectContaining({
        messages: [{ role: 'system', content: 'System' }]
      }));
    });
  });

  describe('error handling', () => {
    it('should propagate litellm errors', async () => {
      vi.mocked(completion).mockRejectedValue(new Error('API Error'));

      const provider = createProviderForModel('gpt-4o');

      await expect(
        provider.generateResponse('System', [{ role: 'user', content: 'Hi' }])
      ).rejects.toThrow('API Error');
    });
  });
});
