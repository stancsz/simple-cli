import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../src/scheduler.js';
import { AutonomousOrchestrator } from '../src/engine/autonomous.js';
import { join } from 'path';
import { writeFile, rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { Context, Registry } from '../src/engine/orchestrator.js';

const TEST_DIR = join(process.cwd(), '.agent-test');
const SCHEDULE_FILE = join(TEST_DIR, 'scheduler.json');

describe('Scheduler Integration', () => {
  beforeEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true });
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should load schedule and emit event on file change', async () => {
    const scheduler = new Scheduler(TEST_DIR);
    const task = {
      id: 'test-task',
      name: 'Test Task',
      trigger: 'file-watch' as const, // Cast to literal type
      path: '.agent-test/trigger.txt',
      prompt: 'do something'
    };

    await writeFile(SCHEDULE_FILE, JSON.stringify({ tasks: [task] }));
    await writeFile(join(TEST_DIR, 'trigger.txt'), 'initial');

    const eventPromise = new Promise((resolve) => {
      scheduler.on('task-triggered', (t) => {
        if (t.id === task.id) resolve(t);
      });
    });

    await scheduler.start();

    // Trigger file change
    // Wait slightly for watcher to initialize
    await new Promise(r => setTimeout(r, 1000));
    await writeFile(join(TEST_DIR, 'trigger.txt'), 'changed');

    const triggeredTask = await eventPromise;
    expect(triggeredTask).toBeDefined();
    expect((triggeredTask as any).id).toBe(task.id);

    await scheduler.stop();
  }, 10000); // Increase timeout
});

// Mock child_process for Scheduler Integration test too
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

describe('AutonomousOrchestrator', () => {
    beforeEach(async () => {
        if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true });
        await mkdir(TEST_DIR, { recursive: true });
      });

      afterEach(async () => {
        if (existsSync(TEST_DIR)) await rm(TEST_DIR, { recursive: true, force: true });
      });

    it('should run without user input', async () => {
        const mockLLM = {
            generate: vi.fn().mockResolvedValue({
                message: "I am done.",
                usage: {}
            })
        };
        const mockRegistry = new Registry();
        const mockMCP = {
            init: vi.fn(),
            getTools: vi.fn().mockResolvedValue([]),
            listServers: vi.fn().mockReturnValue([]),
            startServer: vi.fn(),
            getClient: vi.fn().mockReturnValue(null)
        } as any;

        const logPath = join(TEST_DIR, 'autonomous.log');

        const orchestrator = new AutonomousOrchestrator(mockLLM, mockRegistry, mockMCP, {
            logPath,
            yoloMode: true
        });

        const ctx = new Context(process.cwd(), { name: 'test', systemPrompt: 'test' } as any);

        await orchestrator.run(ctx, "start", { interactive: false });

        expect(mockLLM.generate).toHaveBeenCalled();
    });
});
