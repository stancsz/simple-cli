/**
 * Tests for provider module
 * Tests the OpenAI SDK-based provider implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock TypeLLM before importing providers
vi.mock('@stan-chen/typellm', () => {
  const mockGenerate = vi.fn();
  return {
    createTypeLLM: vi.fn().mockImplementation(() => ({
      generate: mockGenerate,
    })),
    __mockGenerate: mockGenerate
  };
});

import { createProvider, createProviderForModel } from '../src/providers/index.js';
import * as typellm from '@stan-chen/typellm';

// Get mock reference
const getMockGenerate = () => {
  return (typellm as any).__mockGenerate;
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

  it('should create provider with specified model', () => {
    const provider = createProviderForModel('gpt-5-mini');

    expect(provider.model).toBe('gpt-5-mini');
    expect(provider.name).toBe('openai');
  });

  it('should create provider for deepseek model', () => {
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    const provider = createProviderForModel('deepseek-chat');

    expect(provider.model).toBe('deepseek-chat');
  });

  it('should call OpenAI SDK with correct parameters', async () => {
    const mockGenerate = getMockGenerate();
    mockGenerate.mockResolvedValue({
      thought: 'thinking',
      tool: 'none',
      args: {},
      message: 'Hello!'
    });

    const provider = createProviderForModel('gpt-5-mini');
    const result = await provider.generateResponse(
      'You are helpful',
      [{ role: 'user', content: 'Hi' }]
    );

    console.log('DEBUG: result is', result);

    expect(mockGenerate).toHaveBeenCalledWith(
      'You are helpful',
      [{ role: 'user', content: 'Hi' }]
    );
    // expect(result).toContain('Hello!'); // Changing this to be safe
    expect(result.message).toBe('Hello!');
  });

  it('should handle empty response', async () => {
    const mockGenerate = getMockGenerate();
    mockGenerate.mockResolvedValue({
      thought: '',
      tool: 'none',
      args: {},
      message: ''
    });

    const provider = createProviderForModel('gpt-5-mini');
    const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

    // expect(result).toContain('""'); // Changing expectation
     expect(result.message).toBe('');
  });
});

describe('createProvider', () => {
  it('should detect OpenAI when OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-5-mini';
    const provider = createProvider();
    expect(provider.model).toBe('gpt-5-mini');
  });

  it('should use CLAW_MODEL if in claw mode', () => {
    process.argv.push('--claw');
    process.env.CLAW_MODEL = 'claude-3-opus';
    const provider = createProvider();
    expect(provider.model).toBe('claude-3-opus');
    process.argv.pop();
  });
});

describe('conversation handling', () => {
  it('should handle multi-turn conversations', async () => {
    const mockGenerate = getMockGenerate();
    mockGenerate.mockResolvedValue({
      thought: '',
      tool: 'none',
      args: {},
      message: 'Response 2'
    });

    const provider = createProviderForModel('gpt-5-mini');
    await provider.generateResponse('System', [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'First response' },
      { role: 'user', content: 'Second message' }
    ]);

    expect(mockGenerate).toHaveBeenCalledWith(
      'System',
      expect.arrayContaining([
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' }
      ])
    );
  });
});

describe('error handling', () => {
  it('should handle API errors gracefully', async () => {
    const mockGenerate = getMockGenerate();
    mockGenerate.mockRejectedValue(new Error('API Error'));

    const provider = createProviderForModel('gpt-5-mini');
    const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

    // Check error handling behavior from implementation
    // The catch block returns an object
    expect(result.message).toContain('Error calling TypeLLM');
  });
});
