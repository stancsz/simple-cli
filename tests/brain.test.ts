import { describe, it, expect, vi } from 'vitest';
import { EpisodicMemory } from '../src/brain/episodic.js';
import * as lancedb from '@lancedb/lancedb';
import { join } from 'path';

// Mock lancedb
vi.mock('@lancedb/lancedb', () => ({
  connect: vi.fn().mockReturnValue({
    openTable: vi.fn().mockReturnValue({
      add: vi.fn(),
      search: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      toArray: vi.fn().mockReturnValue([]),
    }),
    createTable: vi.fn().mockReturnValue({
      add: vi.fn(),
    }),
    tableNames: vi.fn().mockResolvedValue([]),
  }),
}));

// Mock embedder
vi.mock('../src/brain/embedder.js', () => ({
  getEmbedder: vi.fn().mockResolvedValue({
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    init: vi.fn(),
  }),
}));

describe('EpisodicMemory', () => {
  it('should initialize and add memory', async () => {
    const mockLlm = {
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
    } as any;
    const memory = new EpisodicMemory('test_dir', mockLlm);
    await memory.init();
    await memory.store('task-1', 'test', 'response', []);
    expect(lancedb.connect).toHaveBeenCalled();
  });
});
