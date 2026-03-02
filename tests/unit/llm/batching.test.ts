import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptBatcher } from '../../../src/llm/batching.js';
import * as llmModule from '../../../src/llm.js';
import * as loggerModule from '../../../src/logger.js';
import { TaskDefinition } from '../../../src/interfaces/daemon.js';

// Define hoisted mocks first
const mockLlmInstance = vi.hoisted(() => ({
  generate: vi.fn(),
  embed: vi.fn(),
  personaEngine: {} as any
}));

// Now mock the module
vi.mock('../../../src/llm.js', () => {
  return {
    createLLM: vi.fn(() => mockLlmInstance),
    LLM: vi.fn()
  };
});

vi.mock('../../../src/logger.js', () => ({
  logMetric: vi.fn()
}));

describe('PromptBatcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use a fresh instance with a short delay for tests
    // @ts-ignore
    PromptBatcher.instance = undefined;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should process a single task without batching formatting', async () => {
    const batcher = PromptBatcher.getInstance(50); // 50ms delay
    const task: TaskDefinition = {
      id: 'task-1',
      name: 'Task 1',
      trigger: 'cron',
      prompt: 'Do task 1'
    };

    mockLlmInstance.generate.mockResolvedValueOnce({
      message: 'Result for task 1',
      thought: '',
      tool: 'none',
      args: {},
      raw: 'Result for task 1'
    });

    const promise = batcher.scheduleBatch('group-a', task);

    // Fast forward time
    vi.advanceTimersByTime(100);

    const result = await promise;
    expect(result).toBe('Result for task 1');
    expect(mockLlmInstance.generate).toHaveBeenCalledWith('Do task 1', [{ role: 'user', content: 'Execute task' }]);
  });

  it('should consolidate multiple tasks and parse responses', async () => {
    const batcher = PromptBatcher.getInstance(50);
    const task1: TaskDefinition = { id: 't1', name: 'T1', trigger: 'cron', prompt: 'P1' };
    const task2: TaskDefinition = { id: 't2', name: 'T2', trigger: 'cron', prompt: 'P2' };

    mockLlmInstance.generate.mockResolvedValueOnce({
      message: '<response id="t1">\nResult 1\n</response>\n<response id="t2">\nResult 2\n</response>',
      thought: '',
      tool: 'none',
      args: {},
      raw: '<response id="t1">\nResult 1\n</response>\n<response id="t2">\nResult 2\n</response>'
    });

    const p1 = batcher.scheduleBatch('group-b', task1);
    const p2 = batcher.scheduleBatch('group-b', task2);

    vi.advanceTimersByTime(100);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe('Result 1');
    expect(r2).toBe('Result 2');

    // Verify LLM call
    expect(mockLlmInstance.generate).toHaveBeenCalledTimes(1);
    const callArgs = mockLlmInstance.generate.mock.calls[0];
    const promptSent = callArgs[1][0].content;
    expect(promptSent).toContain('<task id="t1">');
    expect(promptSent).toContain('<task id="t2">');

    // Verify metrics
    expect(loggerModule.logMetric).toHaveBeenCalledWith('llm_batcher', 'batched_prompts_total', 2, { groupId: 'group-b' });
    expect(loggerModule.logMetric).toHaveBeenCalledWith('llm_batcher', 'tokens_saved_via_batching', 500, { groupId: 'group-b' });
  });

  it('should fallback to error message if LLM omits a task response', async () => {
    const batcher = PromptBatcher.getInstance(50);
    const task1: TaskDefinition = { id: 't1', name: 'T1', trigger: 'cron', prompt: 'P1' };
    const task2: TaskDefinition = { id: 't2', name: 'T2', trigger: 'cron', prompt: 'P2' };

    mockLlmInstance.generate.mockResolvedValueOnce({
      message: '<response id="t1">\nResult 1\n</response>', // t2 missing
      thought: '',
      tool: 'none',
      args: {},
      raw: '<response id="t1">\nResult 1\n</response>'
    });

    const p1 = batcher.scheduleBatch('group-c', task1);
    const p2 = batcher.scheduleBatch('group-c', task2);

    vi.advanceTimersByTime(100);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe('Result 1');
    expect(r2).toContain('[Batch Error] No response generated for task t2');
  });
});
