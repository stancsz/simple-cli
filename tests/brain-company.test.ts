import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EpisodicMemory } from '../src/brain/episodic.js';
import { SemanticGraph } from '../src/brain/semantic_graph.js';
import { join } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { createLLM } from '../src/llm.js';

// Mock LLM to avoid API calls
vi.mock('../src/llm.js', () => ({
  createLLM: () => ({
    embed: async (text: string) => Array(1536).fill(0.1), // Mock embedding
    generate: async () => ({ thought: 'mock', tool: 'none' })
  })
}));

const TEST_DIR = join(process.cwd(), 'test-brain-company');

describe('Brain Company Isolation', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
    mkdirSync(TEST_DIR);
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should store episodic memory in company-specific directory', async () => {
    const company = 'client-a';
    const brain = new EpisodicMemory(TEST_DIR, undefined, company);

    await brain.store('task-1', 'req', 'sol', ['file.txt'], company);

    const expectedPath = join(TEST_DIR, '.agent', 'brain', 'clients', company, 'vector_db');
    expect(existsSync(expectedPath)).toBe(true);
  });

  it('should not allow cross-company memory access', async () => {
    const companyA = 'client-a';
    const companyB = 'client-b';

    const brainA = new EpisodicMemory(TEST_DIR, undefined, companyA);
    await brainA.store('task-A', 'req-A', 'sol-A', ['file.txt'], companyA);

    const brainB = new EpisodicMemory(TEST_DIR, undefined, companyB);
    const results = await brainB.recall('req-A', 3, companyB);

    expect(results.length).toBe(0);
  });

  it('should allow memory access within same company', async () => {
    const companyA = 'client-a';

    const brainA1 = new EpisodicMemory(TEST_DIR, undefined, companyA);
    await brainA1.store('task-A', 'req-A', 'sol-A', ['file.txt'], companyA);

    const brainA2 = new EpisodicMemory(TEST_DIR, undefined, companyA);
    const results = await brainA2.recall('req-A', 3, companyA);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].taskId).toBe('task-A');
  });

  it('should store global memory in default directory', async () => {
    const brain = new EpisodicMemory(TEST_DIR, undefined, undefined);
    await brain.store('task-global', 'req', 'sol', ['file.txt']);

    const expectedPath = join(TEST_DIR, '.agent', 'brain', 'episodic');
    expect(existsSync(expectedPath)).toBe(true);
  });

  it('should isolate semantic graph by company', async () => {
    const companyA = 'client-a';
    const graphA = new SemanticGraph(TEST_DIR, companyA);

    await graphA.addNode('NodeA', 'TypeA', {}, companyA);

    const expectedPath = join(TEST_DIR, '.agent', 'brain', 'clients', companyA, 'graph_db', 'graph.json');
    expect(existsSync(expectedPath)).toBe(true);

    const companyB = 'client-b';
    const graphB = new SemanticGraph(TEST_DIR, companyB);
    const dataB = await graphB.getGraphData(companyB);

    expect(dataB.nodes.find(n => n.id === 'NodeA')).toBeUndefined();
  });
});
