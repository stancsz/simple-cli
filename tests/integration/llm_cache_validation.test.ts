import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LLM } from '../../src/llm.js';
import * as configModule from '../../src/config.js';
import * as aiModule from 'ai';
import * as loggerModule from '../../src/logger.js';
import { createLLMCache, RedisCache, FileCache } from '../../src/llm/cache.js';

// --- Mocks ---
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config.js')>();
  return {
    ...actual,
    loadConfig: vi.fn(),
  };
});

vi.mock('../../src/logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/logger.js')>();
  return {
    ...actual,
    logMetric: vi.fn(),
  };
});

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

// Mock ioredis
vi.mock('ioredis', () => {
  const mockRedisClient = {
    status: 'ready',
    get: vi.fn(),
    set: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn(),
  };
  return {
    default: vi.fn(() => mockRedisClient),
  };
});

describe('LLM Caching System End-to-End Validation', () => {
  let llm: LLM;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";

    // Setup basic mock config that can be overridden per test
    vi.mocked(configModule.loadConfig).mockResolvedValue({
      llmCache: {
        enabled: true,
        backend: "file"
      }
    });

    llm = new LLM({ provider: 'openai', model: 'gpt-4' });

    // Disable Persona Engine interference for simple tests
    llm.personaEngine.loadConfig = vi.fn().mockResolvedValue(undefined);
    llm.personaEngine.transformResponse = vi.fn((resp) => Promise.resolve(resp));
    llm.personaEngine.injectPersonality = vi.fn((sys) => sys);

    // Default API mock response
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

  describe('File Backend Validation', () => {
    it('should hit the file cache on repeated identical prompts', async () => {
       vi.mocked(configModule.loadConfig).mockResolvedValue({
        llmCache: { enabled: true, backend: "file" }
      });

      const uniqueRunId = Date.now() + Math.random().toString();
      const prompt = `System prompt for validation ${uniqueRunId}`;

      // 1. Initial Call (Miss) - Using a unique prompt to avoid conflicting with other test files
      const response1 = await llm.generate(prompt, [{ role: 'user', content: 'Test validation integration' }]);
      expect(response1.message).toBe('Success');
      expect(aiModule.generateText).toHaveBeenCalledTimes(1);

      // Verification of cache miss metric
      expect(loggerModule.logMetric).toHaveBeenCalledWith('llm', 'llm_cache_miss', 1, expect.any(Object));

      // Wait a moment for file write
      await new Promise(r => setTimeout(r, 100));

      // 2. Second Call (Hit)
      const response2 = await llm.generate(prompt, [{ role: 'user', content: 'Test validation integration' }]);
      expect(response2.message).toBe('Success');

      // generateText should NOT be called again
      expect(aiModule.generateText).toHaveBeenCalledTimes(1);

      // Verification of cache hit and total cached tokens metric
      expect(loggerModule.logMetric).toHaveBeenCalledWith('llm', 'llm_cache_hit', 1, expect.any(Object));
      expect(loggerModule.logMetric).toHaveBeenCalledWith('llm', 'llm_tokens_total_cached', 100, expect.any(Object));
    });
  });

  describe('Redis Backend Validation', () => {
    it('should correctly configure and use ioredis backend', async () => {
      vi.mocked(configModule.loadConfig).mockResolvedValue({
        llmCache: { enabled: true, backend: "redis" }
      });

      // Get the mocked Redis class constructor
      const RedisMock = (await import('ioredis')).default;
      const redisInstance = new RedisMock();

      // Mock Redis GET to simulate a cache hit on the second try
      let callCount = 0;
      vi.mocked(redisInstance.get).mockImplementation(async () => {
        if (callCount === 0) {
            callCount++;
            return null; // First call: miss
        }
        return JSON.stringify({ thought: "Cached Redis", message: "Redis Hit", usage: { totalTokens: 150 } });
      });

      const uniqueRunId = Date.now() + Math.random().toString();
      const prompt = `System prompt ${uniqueRunId}`;

      // 1. Initial Call (Miss)
      await llm.generate(prompt, [{ role: 'user', content: 'Redis test' }]);
      expect(aiModule.generateText).toHaveBeenCalledTimes(1);
      expect(redisInstance.set).toHaveBeenCalled(); // Ensure the miss resulted in a SET

      // 2. Second Call (Hit)
      const response2 = await llm.generate(prompt, [{ role: 'user', content: 'Redis test' }]);
      expect(response2.message).toBe('Redis Hit');
      expect(aiModule.generateText).toHaveBeenCalledTimes(1); // Not called again

      // Check metrics
      expect(loggerModule.logMetric).toHaveBeenCalledWith('llm', 'llm_cache_hit', 1, expect.any(Object));
      expect(loggerModule.logMetric).toHaveBeenCalledWith('llm', 'llm_tokens_total_cached', 150, expect.any(Object));
    });
  });

  describe('Metrics and Analytics', () => {
      it('should correctly calculate and log llm_cache_size on miss', async () => {
        vi.mocked(configModule.loadConfig).mockResolvedValue({
            llmCache: { enabled: true, backend: "file" }
        });

        const uniqueRunId = Date.now() + Math.random().toString();
        const prompt = `System prompt unique metrics ${uniqueRunId}`;

        await llm.generate(prompt, [{ role: 'user', content: 'Metrics test' }]);

        // Should log size
        expect(loggerModule.logMetric).toHaveBeenCalledWith(
            'llm',
            'llm_cache_size',
            expect.any(Number),
            expect.objectContaining({ model: 'gpt-4', provider: 'openai' })
        );

        // Verify the size is a positive number greater than basic JSON length
        const callArgs = vi.mocked(loggerModule.logMetric).mock.calls.find(
            call => call[1] === 'llm_cache_size'
        );
        expect(callArgs![2]).toBeGreaterThan(20); // At least 20 bytes
      });
  });

  describe('Performance Benchmark', () => {
      it('should demonstrate reduced API calls and saved tokens when caching is active', async () => {
        vi.mocked(configModule.loadConfig).mockResolvedValue({
            llmCache: { enabled: true, backend: "file" }
        });

        const uniqueRunId = Date.now() + Math.random().toString();
        const prompt = `Benchmark prompt unique ${uniqueRunId}`;

        const loops = 5;
        for(let i = 0; i < loops; i++) {
            await llm.generate(prompt, [{ role: 'user', content: 'Repeated task' }]);
        }

        // We only expect 1 API call despite 5 requests
        expect(aiModule.generateText).toHaveBeenCalledTimes(1);

        // The remaining 4 calls should be cache hits, saving 400 tokens total (100 tokens per call)
        const hitCalls = vi.mocked(loggerModule.logMetric).mock.calls.filter(call => call[1] === 'llm_cache_hit');
        expect(hitCalls.length).toBe(4);

        const savedTokensCalls = vi.mocked(loggerModule.logMetric).mock.calls.filter(call => call[1] === 'llm_tokens_total_cached');
        expect(savedTokensCalls.length).toBe(4);
        const totalSaved = savedTokensCalls.reduce((acc, call) => acc + (call[2] as number), 0);
        expect(totalSaved).toBe(400); // 4 hits * 100 tokens
      });
  });
});
