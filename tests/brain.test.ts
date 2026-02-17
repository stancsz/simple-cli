import { describe, it, expect, vi } from 'vitest';
import { EpisodicMemory } from '../src/brain/episodic.js';
import * as lancedb from '@lancedb/lancedb';
import { join } from 'path';

// Mock lancedb
vi.mock('@lancedb/lancedb', () => ({
  connect: vi.fn().mockReturnValue({
    tableNames: vi.fn().mockResolvedValue([]), // Add tableNames mock
    openTable: vi.fn().mockReturnValue({
      add: vi.fn(),
      search: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockReturnValue([]),
    }),
    createTable: vi.fn().mockReturnValue({
      add: vi.fn(),
    }),
  }),
}));

// Mock LLM
vi.mock('../src/llm.js', () => ({
  createLLM: vi.fn().mockReturnValue({
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    generate: vi.fn(),
  }),
}));

describe('EpisodicMemory', () => {
  it('should initialize and store memory', async () => {
    const memory = new EpisodicMemory('test_dir');
    await memory.init();
    await memory.store('test', 'request', 'response', []);
    expect(lancedb.connect).toHaveBeenCalled();
  });
});
