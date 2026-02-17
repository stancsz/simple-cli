import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scheduler } from '../src/scheduler';
import { join } from 'path';
import { mkdir, writeFile, rm, readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';

const TEST_AGENT_DIR = join(process.cwd(), '.agent', 'test_ghost_mode');
const SCHEDULER_FILE = join(TEST_AGENT_DIR, 'scheduler.json');

describe('Ghost Mode Scheduler & JobDelegator', () => {
  let scheduler: Scheduler;

  beforeEach(async () => {
    // Clean up if exists
    if (existsSync(TEST_AGENT_DIR)) {
      await rm(TEST_AGENT_DIR, { recursive: true, force: true });
    }
    await mkdir(TEST_AGENT_DIR, { recursive: true });

    scheduler = new Scheduler(TEST_AGENT_DIR);
    scheduler.setTestMode(true);

    vi.useFakeTimers();
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.useRealTimers();
    if (existsSync(TEST_AGENT_DIR)) {
        await rm(TEST_AGENT_DIR, { recursive: true, force: true });
    }
  });

  it('should schedule and trigger a task', async () => {
    const task = {
        id: 'test-task-1',
        name: 'Test Task',
        trigger: 'cron',
        schedule: '* * * * *', // Every minute
        prompt: 'Do something',
        yoloMode: true
    };

    await writeFile(SCHEDULER_FILE, JSON.stringify({ tasks: [task] }, null, 2));

    const taskTriggeredPromise = new Promise<void>((resolve) => {
        scheduler.on('task-triggered', (t) => {
            if (t.id === task.id) resolve();
        });
    });

    await scheduler.start();

    // Advance time by 65 seconds to trigger the cron
    await vi.advanceTimersByTimeAsync(65 * 1000);

    // Wait for the task to be triggered
    await taskTriggeredPromise;

    // Verify pending tasks are cleared
    expect(scheduler.getPendingTasks()).toHaveLength(0);

    // Verify log file creation
    const logsDir = join(TEST_AGENT_DIR, 'ghost_logs');
    expect(existsSync(logsDir)).toBe(true);

    const files = await readdir(logsDir);
    expect(files.length).toBeGreaterThan(0);

    const logContent = await readFile(join(logsDir, files[0]), 'utf-8');
    const log = JSON.parse(logContent);

    expect(log.taskId).toBe('test-task-1');
    expect(log.status).toBe('test-skipped');
  });

  it('should trigger Morning Standup task automatically', async () => {
    // Set system time to 8:59 AM
    const date = new Date();
    date.setHours(8, 59, 0, 0);
    vi.setSystemTime(date);

    // Write empty config to trigger defaults
    await writeFile(SCHEDULER_FILE, JSON.stringify({ tasks: [] }, null, 2));

    const taskTriggeredPromise = new Promise<void>((resolve) => {
        scheduler.on('task-triggered', (t) => {
            if (t.name === 'Morning Standup') resolve();
        });
    });

    await scheduler.start();

    // Verify task was added
    const config = JSON.parse(await readFile(SCHEDULER_FILE, 'utf-8'));
    const standupTask = config.tasks.find((t: any) => t.name === 'Morning Standup');
    expect(standupTask).toBeDefined();

    // Advance time by 2 minutes to cross 9:00 AM
    await vi.advanceTimersByTimeAsync(2 * 60 * 1000);

    await taskTriggeredPromise;

    // Verify log
    const logsDir = join(TEST_AGENT_DIR, 'ghost_logs');
    const files = await readdir(logsDir);
    const standupLogFile = files.find(f => f.includes('morning-standup') || (standupTask && f.includes(standupTask.id)));

    expect(standupLogFile).toBeDefined();
    if (standupLogFile) {
        const logContent = await readFile(join(logsDir, standupLogFile), 'utf-8');
        const log = JSON.parse(logContent);
        expect(log.taskName).toBe('Morning Standup');
        expect(log.status).toBe('test-skipped');
    }
  });
});
