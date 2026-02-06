/**
 * Tests for provider module
 * Tests the OpenAI SDK-based provider implementation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock TypeLLM before importing providers
vi.mock('../src/lib/typellm.js', () => {
  const mockGenerate = vi.fn();
  return {
    createTypeLLM: vi.fn().mockImplementation(() => ({
      generate: mockGenerate,
    })),
    __mockGenerate: mockGenerate
  };
});

import { createProvider, createProviderForModel } from '../src/providers/index.js';
import * as typellm from '../src/lib/typellm.js';

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
    const provider = createProviderForModel('gpt-4o');

    expect(provider.model).toBe('gpt-4o');
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

    const provider = createProviderForModel('gpt-4o');
    const result = await provider.generateResponse(
      'You are helpful',
      [{ role: 'user', content: 'Hi' }]
    );

    expect(mockGenerate).toHaveBeenCalledWith(
      'You are helpful',
      [{ role: 'user', content: 'Hi' }]
    );
    // The previous test expected result to contain "Hello!".
    // But provider.generateResponse returns TypeLLMResponse.
    // In src/providers/index.ts:
    // return response; // TypeLLMResponse

    // Wait, the original test:
    // expect(result).toContain('Hello!');
    // If result is an object { thought, ... }, toContain check might fail if it's expecting a string?
    // Or maybe generateResponse returned a string in previous version?

    // Let's check src/providers/index.ts.
    // generateResponse: ... Promise<TypeLLMResponse>

    // If TypeLLMResponse is an object, `expect(result).toContain('Hello!')` checks if keys contain Hello! (if result is object)? No.
    // Jest/Vitest: .toContain() on object? Usually check values?
    // Or maybe result was a string?

    // In previous version (using package), maybe generateResponse returned string?
    // I updated src/providers/index.ts.
    // It returns `response` which is `TypeLLMResponse` (object).

    // The test `expect(result).toContain('Hello!')` will fail if result is { message: 'Hello!' }.
    // It should be `expect(result.message).toBe('Hello!')` or similar.

    // Wait, let's check what `generateResponse` returned before.
    // "createTypeLLM" from package.
    // The implementation of `generate` in package returns `TypeLLMResponse`.

    // Maybe `provider.generateResponse` used to return string?
    // Let's check `src/providers/index.ts` BEFORE my changes.
    // I overwrote it.

    // But the memory says: `generateResponse: (systemPrompt: string, messages: Message[]) => Promise<TypeLLMResponse>;` in interface.

    // So the test must have been wrong or `toContain` works on object values?
    // `expect({a: 1}).toContain(1)`? No.

    // Ah, maybe the test was written for a different version?

    // I will fix the test expectation to match `TypeLLMResponse`.

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

    const provider = createProviderForModel('gpt-4o');
    const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

    // expect(result).toContain('""');
    // This expects the result object to contain '""'? Unlikely.
    // Maybe it expects `result.raw` or `result.message`?
    // If message is empty string.

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

    const provider = createProviderForModel('gpt-4o');
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

    const provider = createProviderForModel('gpt-4o');
    const result = await provider.generateResponse('System', [{ role: 'user', content: 'Hi' }]);

    // expect(result).toContain('Error calling TypeLLM');
    // Result is TypeLLMResponse.
    // The implementation catches error and returns:
    // { thought: 'Error...', message: 'Error calling TypeLLM: API Error', ... }

    expect(result.message).toContain('Error calling TypeLLM');
  });
});
