import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLM } from '../../src/llm.js';
import * as configModule from '../../src/config.js';
import * as aiModule from 'ai';

vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

describe('LLM Cache Integration', () => {
  let llm: LLM;

  beforeEach(() => {
    vi.clearAllMocks();

    // Enable cache in mock config
    vi.mocked(configModule.loadConfig).mockResolvedValue({
      llmCache: {
        enabled: true,
        backend: "file"
      }
    });

    llm = new LLM({ provider: 'openai', model: 'gpt-4' });

    // Disable Persona Engine to prevent transforming our "Success" string into an offline/away message.
    llm.personaEngine.loadConfig = vi.fn().mockResolvedValue(undefined);
    llm.personaEngine.transformResponse = vi.fn((resp) => Promise.resolve(resp));
    llm.personaEngine.injectPersonality = vi.fn((sys) => sys);

    // Mock API response
    vi.mocked(aiModule.generateText).mockResolvedValue({
      text: '{"thought": "Mocking API", "message": "Success"}',
      usage: {
        totalTokens: 100,
        promptTokens: 50,
        completionTokens: 50,
      }
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should call generateText on first call and hit cache on second call', async () => {
    // First call (cache miss)
    const response1 = await llm.generate('System prompt', [{ role: 'user', content: 'Test integration' }]);

    expect(response1.message).toBe('Success');
    expect(aiModule.generateText).toHaveBeenCalledTimes(1);

    // Wait slightly to ensure file is written properly in async world
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Second call (cache hit)
    const response2 = await llm.generate('System prompt', [{ role: 'user', content: 'Test integration' }]);

    expect(response2.message).toBe('Success');
    // API should not be called again
    expect(aiModule.generateText).toHaveBeenCalledTimes(1);
  });

  it('should bypass cache in YOLO mode', async () => {
     vi.mocked(configModule.loadConfig).mockResolvedValue({
        yoloMode: true,
        llmCache: {
           enabled: true,
           backend: "file"
        }
     });

    const response1 = await llm.generate('System prompt', [{ role: 'user', content: 'Test YOLO' }]);
    expect(response1.message).toBe('Success');
    expect(aiModule.generateText).toHaveBeenCalledTimes(1);

    const response2 = await llm.generate('System prompt', [{ role: 'user', content: 'Test YOLO' }]);
    expect(response2.message).toBe('Success');
    // API SHOULD be called again
    expect(aiModule.generateText).toHaveBeenCalledTimes(2);
  });
});
