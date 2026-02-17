import { describe, it, expect, vi } from 'vitest';
import { EpisodicMemory } from '../src/brain/episodic.js';
import * as lancedb from '@lancedb/lancedb';

// Mock lancedb
vi.mock('@lancedb/lancedb', () => ({
  connect: vi.fn().mockResolvedValue({
    tableNames: vi.fn().mockResolvedValue([]),
    openTable: vi.fn().mockResolvedValue({
      add: vi.fn(),
      search: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockReturnValue([]),
    }),
    createTable: vi.fn().mockResolvedValue({
      add: vi.fn(),
    }),
  }),
}));

describe('EpisodicMemory', () => {
  it('should initialize and add memory', async () => {
    const mockLLM = {
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        generate: vi.fn()
    };
    const memory = new EpisodicMemory('test_dir', mockLLM as any);
    await memory.init();
    await memory.store('task-1', 'test request', 'test response', []);
    // lancedb.connect is an async function in the mock now?
    // Wait, vi.mock returns the module.
    // In the original test it was sync return value?
    // lancedb.connect is async.
  });
});
