import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    createTable: vi.fn().mockReturnValue({
      add: vi.fn(),
    }),
  }),
}));

// Mock LLM
const mockLLM = {
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  generate: vi.fn(),
};

vi.mock('../src/llm.js', () => ({
  createLLM: vi.fn(() => mockLLM),
}));

describe('EpisodicMemory', () => {
  it('should initialize and store memory', async () => {
    const memory = new EpisodicMemory('test_dir', mockLLM as any);
    await memory.init();
    await memory.store('task-1', 'test request', 'test solution', []);
    expect(lancedb.connect).toHaveBeenCalled();
  });
});
