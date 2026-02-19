import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../src/scheduler.js';
import { join } from 'path';
import { mkdtemp, rm, writeFile, readFile, readdir, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { mockCallTool, mockGetClient } from './mocks/mcp_client.js';

// Mock MCP
vi.mock('../src/mcp.js', async () => {
    return await vi.importActual('./mocks/mcp_client.js');
});

// Mock child_process to avoid actual spawning
vi.mock('child_process', () => {
  return {
    spawn: vi.fn().mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'close') {
          setTimeout(() => cb(0), 10); // Simulate success
        }
      }),
      kill: vi.fn(),
      unref: vi.fn(),
    }),
  };
});

describe('Ghost Mode Persistence & Reviewer', () => {
  let tempDir: string;
  let scheduler: Scheduler;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCallTool.mockResolvedValue({ content: [] });
    mockGetClient.mockReturnValue({
        callTool: mockCallTool
    });
    tempDir = await mkdtemp(join(tmpdir(), 'ghost-mode-test-'));
    scheduler = new Scheduler(tempDir);
  });

  afterEach(async () => {
    await scheduler.stop();
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('should schedule a task, execute it, and log to ghost_logs', async () => {
    const taskDef = {
      id: 'test-task',
      name: 'Test Task',
      trigger: 'cron' as const,
      schedule: '* * * * *', // Every minute
      prompt: 'Test prompt',
      yoloMode: true
    };

    // Manually inject task into scheduler.json
    const scheduleFile = join(tempDir, 'scheduler.json');
    await writeFile(scheduleFile, JSON.stringify({ tasks: [taskDef] }));

    // Start scheduler
    await scheduler.start();

    // Trigger the task manually via private method access
    await (scheduler as any).runTask(taskDef);

    // Verify logs
    const logsDir = join(tempDir, 'ghost_logs');
    // Wait a bit for file write
    await new Promise(r => setTimeout(r, 100));

    expect(existsSync(logsDir)).toBe(true);
    // There should be a log file
    const logFiles = await readdir(logsDir);
    expect(logFiles.length).toBeGreaterThan(0);

    const logContent = await readFile(join(logsDir, logFiles[0]), 'utf-8');
    const log = JSON.parse(logContent);
    expect(log.taskId).toBe('test-task');
    expect(log.status).toBe('success');
  });

  it('should persist pending tasks state', async () => {
    const taskDef = {
        id: 'pending-task',
        name: 'Pending Task',
        trigger: 'cron' as const,
        schedule: '* * * * *',
        prompt: 'Pending prompt'
    };

    // Mock delegateTask to hang so it stays pending
    const originalDelegate = (scheduler as any).delegator.delegateTask;
    let resolveDelegate: any;
    (scheduler as any).delegator.delegateTask = vi.fn().mockImplementation(() => {
        return new Promise(resolve => { resolveDelegate = resolve; });
    });

    // Run task (will hang)
    const runPromise = (scheduler as any).runTask(taskDef);

    // Check state file
    await new Promise(r => setTimeout(r, 50));
    const stateFile = join(tempDir, 'scheduler_state.json');
    expect(existsSync(stateFile)).toBe(true);

    const state = JSON.parse(await readFile(stateFile, 'utf-8'));
    expect(state.pendingTasks).toHaveLength(1);
    expect(state.pendingTasks[0].id).toBe('pending-task');

    // Finish task
    if (resolveDelegate) resolveDelegate();
    await runPromise;

    // Check state file again (should be empty)
    const endState = JSON.parse(await readFile(stateFile, 'utf-8'));
    expect(endState.pendingTasks).toHaveLength(0);
  });

  it('should generate morning standup report', async () => {
      // 1. Generate some dummy logs
      const logsDir = join(tempDir, 'ghost_logs');
      await mkdir(logsDir, { recursive: true });

      const log1 = {
          taskId: 'task-1',
          taskName: 'Task 1',
          startTime: Date.now() - 10000,
          endTime: Date.now() - 5000,
          status: 'success'
      };
       const log2 = {
          taskId: 'task-2',
          taskName: 'Task 2',
          startTime: Date.now() - 20000,
          endTime: Date.now() - 15000,
          status: 'failed',
          errorMessage: 'Some error'
      };

      await writeFile(join(logsDir, 'log1.json'), JSON.stringify(log1));
      await writeFile(join(logsDir, 'log2.json'), JSON.stringify(log2));

      // 2. Run Reviewer
      const { Reviewer } = await import('../src/reviewer/index.js');
      const reviewer = new Reviewer(tempDir);
      const report = await reviewer.runMorningStandup();

      // 3. Verify report content
      expect(report).toContain('# Morning Standup');
      expect(report).toContain('**Total Tasks:** 2');
      expect(report).toContain('**Success:** 1');
      expect(report).toContain('**Failed:** 1');
      expect(report).toContain('Task 1');
      expect(report).toContain('Task 2');

      // 4. Verify report file
      const reportsDir = join(tempDir, 'daily_reports');
      expect(existsSync(reportsDir)).toBe(true);
      const reportFiles = await readdir(reportsDir);
      expect(reportFiles.length).toBe(1);
  });
});
