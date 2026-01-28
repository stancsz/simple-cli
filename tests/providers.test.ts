/**
 * Tests for provider module
 * Tests the OpenAI SDK-based provider implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock OpenAI before importing providers
vi.mock('openai', () => {
  const mockCreate = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate
        }
      }
    })),
    __mockCreate: mockCreate  // Export for test access
  };
});

import { createProvider, createProviderForModel } from '../src/providers/index.js';
import OpenAI from 'openai';

// Get mock reference
const getMockCreate = () => {
  const instance = new OpenAI({ apiKey: 'test' });
  return instance.chat.completions.create as ReturnType<typeof vi.fn>;
};

describe('providers', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // Set up default API key for tests
    process.env.OPENAI_API_KEY = 'test-openai-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('createProviderForModel', () => {
    it('should create provider with specified model', () => {
      const provider = createProviderForModel('gpt-4o');

      expect(provider.model).toBe('gpt-4o');
      expect(provider.name).toBe('openai-compatible');
    });

    it('should create provider for deepseek model', () => {
      process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
      const provider = createProviderForModel('deepseek-chat');

      expect(provider.model).toBe('deepseek-chat');
    });

    it('should call OpenAI SDK with correct parameters', async () => {
      const mockCreate = getMockCreate();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Hello!' } }]
      });

      const provider = createProviderForModel('gpt-4o');
      const result = await provider.generateResponse(
        'You are helpful',
        [{ role: 'user', content: 'Hi' }]
      );

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hi' }
        ]
      });
      expect(result).toBe('Hello!');
    });

    it('should handle empty response', async () => {
      const mockCreate = getMockCreate();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: '' } }]
      });

      const provider = createProviderForModel('gpt-4o');
      const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('');
    });

    it('should handle missing content in response', async () => {
      const mockCreate = getMockCreate();
      mockCreate.mockResolvedValue({
        choices: [{ message: {} }]
      });

      const provider = createProviderForModel('gpt-4o');
      const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('');
    });
  });

  describe('createProvider', () => {
    it('should detect OpenAI when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;

      const provider = createProvider();

      expect(provider.model).toContain('gpt');
    });

    it('should detect DeepSeek when DEEPSEEK_API_KEY is set', () => {
      delete process.env.OPENAI_API_KEY;
      process.env.DEEPSEEK_API_KEY = 'test-key';

      const provider = createProvider();

      expect(provider.model).toContain('deepseek');
    });

    it('should detect Groq when GROQ_API_KEY is set', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      process.env.GROQ_API_KEY = 'test-key';

      const provider = createProvider();

      expect(provider.model).toContain('llama');
    });

    it('should detect Mistral when MISTRAL_API_KEY is set', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.GROQ_API_KEY;
      process.env.MISTRAL_API_KEY = 'test-key';

      const provider = createProvider();

      expect(provider.model).toContain('mistral');
    });

    it('should throw error when no API key is set', () => {
      delete process.env.OPENAI_API_KEY;
      delete process.env.DEEPSEEK_API_KEY;
      delete process.env.GROQ_API_KEY;
      delete process.env.MISTRAL_API_KEY;

      expect(() => createProvider()).toThrow('No supported API key found');
    });

    it('should use custom model from environment', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.OPENAI_MODEL = 'gpt-4-turbo';

      const provider = createProvider();

      expect(provider.model).toBe('gpt-4-turbo');
    });
  });

  describe('conversation handling', () => {
    it('should handle multi-turn conversations', async () => {
      const mockCreate = getMockCreate();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response 2' } }]
      });

      const provider = createProviderForModel('gpt-4o');
      await provider.generateResponse('System', [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' }
      ]);

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        messages: expect.arrayContaining([
          { role: 'system', content: 'System' },
          { role: 'user', content: 'First message' },
          { role: 'assistant', content: 'First response' },
          { role: 'user', content: 'Second message' }
        ])
      }));
    });

    it('should handle empty conversation history', async () => {
      const mockCreate = getMockCreate();
      mockCreate.mockResolvedValue({
        choices: [{ message: { content: 'Response' } }]
      });

      const provider = createProviderForModel('gpt-4o');
      await provider.generateResponse('System', []);

      expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
        messages: [{ role: 'system', content: 'System' }]
      }));
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const mockCreate = getMockCreate();
      mockCreate.mockRejectedValue(new Error('API Error'));

      const provider = createProviderForModel('gpt-4o');
      const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

      // Implementation returns error message instead of throwing
      expect(result).toContain('Error calling LLM');
    });
  });
});
