import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileCache, RedisCache, createLLMCache } from '../../src/llm/cache.js';
import { promises as fs } from 'fs';
import { join } from 'path';

const mockResponse = {
  thought: "I should test this.",
  tool: "none",
  args: {},
  message: "Hello world",
  raw: '{"thought":"I should test this.","message":"Hello world"}',
};

describe('LLMCache - FileCache', () => {
  const cacheDir = join(process.cwd(), ".agent", "cache", "llm");

  beforeEach(async () => {
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.rm(cacheDir, { recursive: true, force: true });
    } catch {}
  });

  it('should set and get from file cache', async () => {
    const cache = new FileCache(3600);
    await cache.set('test_prompt', 'modelA', mockResponse);

    const cached = await cache.get('test_prompt', 'modelA');
    expect(cached).toEqual(mockResponse);
  });

  it('should return null for miss', async () => {
    const cache = new FileCache(3600);
    const cached = await cache.get('missing_prompt', 'modelA');
    expect(cached).toBeNull();
  });

  it('should expire items based on ttl', async () => {
    // 1 ms ttl
    const cache = new FileCache(0.001);
    await cache.set('expiring_prompt', 'modelA', mockResponse);

    // Wait a bit
    await new Promise((resolve) => setTimeout(resolve, 50));

    const cached = await cache.get('expiring_prompt', 'modelA');
    expect(cached).toBeNull();
  });
});

describe('createLLMCache', () => {
  it('should return null if not enabled', () => {
    const cache = createLLMCache({ enabled: false });
    expect(cache).toBeNull();
  });

  it('should create FileCache by default', () => {
    const cache = createLLMCache({ enabled: true });
    expect(cache).toBeInstanceOf(FileCache);
  });

  it('should create RedisCache if requested', () => {
    // Fake redis url
    const cache = createLLMCache({ enabled: true, backend: 'redis' });
    expect(cache).toBeInstanceOf(RedisCache);
  });
});
