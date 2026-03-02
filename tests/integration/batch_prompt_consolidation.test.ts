import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleTaskTrigger } from '../../src/scheduler/trigger.js';
import { PromptBatcher } from '../../src/llm/batching.js';
import * as llmModule from '../../src/llm.js';
import { TaskDefinition } from '../../src/interfaces/daemon.js';

const mockLlmInstance = vi.hoisted(() => ({
  generate: vi.fn(),
  embed: vi.fn(),
  personaEngine: {} as any
}));

vi.mock('../../src/llm.js', () => {
  return {
    createLLM: vi.fn(() => mockLlmInstance),
    LLM: vi.fn()
  };
});

// Avoid actually saving files in tests
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue('{}'),
  appendFile: vi.fn().mockResolvedValue(undefined)
}));

describe('Batch Prompt Consolidation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-ignore
    PromptBatcher.instance = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should route batcheable tasks through PromptBatcher and consolidate execution', async () => {
    const task1: TaskDefinition = {
      id: 'scan-1',
      name: 'Scan 1',
      trigger: 'cron',
      prompt: 'Do scan 1',
      batchingGroup: 'scan_group'
    };

    const task2: TaskDefinition = {
      id: 'scan-2',
      name: 'Scan 2',
      trigger: 'cron',
      prompt: 'Do scan 2',
      batchingGroup: 'scan_group'
    };

    mockLlmInstance.generate.mockResolvedValueOnce({
      message: '<response id="scan-1">\nScan 1 complete\n</response>\n<response id="scan-2">\nScan 2 complete\n</response>',
      thought: '',
      tool: 'none',
      args: {},
      raw: 'raw'
    });

    // We can't await these directly because they delay until the timer pops
    const p1 = handleTaskTrigger(task1);
    const p2 = handleTaskTrigger(task2);

    // Fast-forward to trigger batch execution (default 30s)
    vi.advanceTimersByTime(31000);

    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1.exitCode).toBe(0);
    expect(res2.exitCode).toBe(0);

    // Assert only one LLM call was made instead of two
    expect(mockLlmInstance.generate).toHaveBeenCalledTimes(1);

    const callArgs = mockLlmInstance.generate.mock.calls[0];
    const systemPrompt = callArgs[0];
    const messages = callArgs[1];

    expect(systemPrompt).toBe('You are an expert autonomous agent.');
    expect(messages[0].content).toContain('<task id="scan-1">');
    expect(messages[0].content).toContain('<task id="scan-2">');
  });
});
