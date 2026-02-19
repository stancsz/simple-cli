import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/scheduler.js';
import { join } from 'path';
import { mkdtemp, rm, writeFile, readFile, readdir, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { mockCallTool, mockInit, mockStartServer, mockGetClient } from '../mocks/mcp_client.js';

// Mock MCP
vi.mock('../../src/mcp.js', async () => {
    // Import the exported mocks from the mock file
    // We use a dynamic import or require.
    // However, since we are in ESM (likely), we should try to return the mock class.
    // But to share state, we need to access the SAME mock instances.
    const mocks = await vi.importActual('../mocks/mcp_client.js');
    return mocks;
});

// Mock child_process
vi.mock('child_process', () => {
  return {
    spawn: vi.fn().mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 10);
        }
      }),
      kill: vi.fn(),
      unref: vi.fn(),
    }),
  };
});

// Mock Trigger
vi.mock('../../src/scheduler/trigger.js', () => ({
  handleTaskTrigger: vi.fn().mockResolvedValue({ exitCode: 0 })
}));

describe('Ghost Mode Integration', () => {
  let tempDir: string;
  let scheduler: Scheduler;

  beforeEach(async () => {
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), 'ghost-mode-integration-'));
    scheduler = new Scheduler(tempDir);

    // Reset mock returns
    mockCallTool.mockReset();
    mockCallTool.mockResolvedValue({ content: [] });
    mockGetClient.mockReturnValue({
        callTool: mockCallTool
    });
  });

  afterEach(async () => {
    await scheduler.stop();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should trigger a scheduled task and log experience to Brain', async () => {
    // Setup Brain Recall Response
    mockCallTool.mockImplementation(async ({ name }) => {
        if (name === 'recall_delegation_patterns') {
            return { content: [{ type: 'text', text: 'Pattern found' }] };
        }
        return { content: [] };
    });

    const taskDef = {
      id: 'integration-task',
      name: 'Integration Task',
      trigger: 'cron' as const,
      schedule: '* * * * *',
      prompt: 'Do integration work',
      yoloMode: true,
      company: 'test-company'
    };

    // 1. Start Scheduler
    await scheduler.start();

    // 2. Inject Task (simulating cron trigger manually to avoid waiting)
    await (scheduler as any).runTask(taskDef);

    // 3. Verify MCP Init and Server Start
    expect(mockInit).toHaveBeenCalled();
    expect(mockStartServer).toHaveBeenCalledWith('brain');

    // 4. Verify Brain Logging
    expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({
        name: 'log_experience',
        arguments: expect.objectContaining({
            taskId: 'integration-task',
            outcome: 'success',
            company: 'test-company'
        })
    }));

    // 5. Verify local logs
    const logsDir = join(tempDir, 'ghost_logs');
    expect(existsSync(logsDir)).toBe(true);
  });

  it('should verify ReviewerAgent logs to Brain', async () => {
      const { ReviewerAgent } = await import('../../src/agents/reviewer_agent.js');
      const reviewer = new ReviewerAgent();
      const task = {
          id: 'review-task',
          name: 'review',
          trigger: 'cron' as const,
          prompt: 'Review code',
          company: 'test-company'
      };
      const artifacts = ['file1.ts'];

      await reviewer.reviewTask(task, artifacts);

      expect(mockInit).toHaveBeenCalled();
      expect(mockCallTool).toHaveBeenCalledWith(expect.objectContaining({
          name: 'log_experience',
          arguments: expect.objectContaining({
              task_type: 'review',
              agent_used: 'reviewer-agent',
              outcome: 'approved',
              company: 'test-company'
          })
      }));
  });
});
