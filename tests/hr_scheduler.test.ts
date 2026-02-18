import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import cron from 'node-cron';

// Mocks must be defined before imports that use them
vi.mock('fs/promises');
vi.mock('fs', async () => {
    return {
        existsSync: vi.fn(),
        promises: {
            readFile: vi.fn(),
            writeFile: vi.fn(),
        }
    }
});

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(() => ({ stop: vi.fn() })),
    validate: vi.fn().mockReturnValue(true),
  }
}));

vi.mock('../src/scheduler/job_delegator.js', () => ({
  JobDelegator: vi.fn().mockImplementation(() => ({
    delegateTask: vi.fn(),
  })),
}));

vi.mock('../src/mcp_servers/hr/storage.js', () => ({
  ProposalStorage: vi.fn().mockImplementation(() => ({
    init: vi.fn(),
    add: vi.fn(),
    getPending: vi.fn().mockReturnValue([]),
  })),
}));

vi.mock('../src/llm.js', () => ({
  createLLM: vi.fn().mockReturnValue({
    generate: vi.fn().mockResolvedValue({ message: JSON.stringify({ improvement_needed: false, analysis: "All good" }) }),
  }),
}));

vi.mock('../src/brain/episodic.js', () => ({
  EpisodicMemory: vi.fn().mockImplementation(() => ({
    recall: vi.fn().mockResolvedValue([]),
  })),
}));

import { Scheduler } from '../src/scheduler';
import { HRServer } from '../src/mcp_servers/hr/index';

// Stateful FS Mock logic
let fsState: Record<string, string> = {};

describe('Scheduler Integration', () => {
  let scheduler: Scheduler;
  const mockAgentDir = '/tmp/test-agent';

  beforeEach(() => {
    vi.clearAllMocks();
    fsState = {};

    // Setup FS mocks
    (fs.readFile as any).mockImplementation(async (path: string) => {
      if (fsState[path]) return fsState[path];
      return JSON.stringify({ tasks: [] });
    });

    (fs.writeFile as any).mockImplementation(async (path: string, content: string) => {
      fsState[path] = content;
    });

    (existsSync as any).mockImplementation((path: string) => {
        if (fsState[path]) return true;
        if (path.endsWith('scheduler.json')) return true;
        return true;
    });

    scheduler = new Scheduler(mockAgentDir);
  });

  it('should ensure Weekly HR Review task is added', async () => {
    await scheduler.start();

    // Check the final state of the file
    // The Scheduler writes to join(agentDir, 'scheduler.json')
    // We iterate over fsState to find it
    const schedulePath = Object.keys(fsState).find(k => k.endsWith('scheduler.json'));
    expect(schedulePath).toBeDefined();

    if (schedulePath) {
        const config = JSON.parse(fsState[schedulePath]);
        const weeklyTask = config.tasks.find((t: any) => t.id === 'weekly-hr-review');

        expect(weeklyTask).toBeDefined();
        expect(weeklyTask.schedule).toBe('0 0 * * 0');
        expect(weeklyTask.prompt).toContain('perform_weekly_review');
    }
  });

  it('should schedule the cron job', async () => {
    // Ensure validate returns true
    (cron.validate as any).mockReturnValue(true);

    await scheduler.start();

    // Check if cron.schedule was called with the correct pattern
    const cronCalls = (cron.schedule as any).mock.calls;
    // We expect 3 tasks: HR, Morning, Weekly
    const weeklyCron = cronCalls.find((call: any[]) => call[0] === '0 0 * * 0');

    expect(weeklyCron).toBeDefined();
  });
});

describe('HRServer Unit', () => {
  let server: HRServer;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock FS for logs
    (fs.readFile as any).mockResolvedValue(JSON.stringify([
      { timestamp: 123, sop: "test", result: { success: true, logs: [] } }
    ]));
    (existsSync as any).mockReturnValue(true);

    server = new HRServer();
  });

  it('should have perform_weekly_review tool', async () => {
    expect(server.performWeeklyReview).toBeDefined();
  });

  it('performWeeklyReview should call performAnalysis with limit 50', async () => {
    // Inject mock LLM if it was undefined (though it shouldn't be with the mock above)
    if (!(server as any).llm) {
        (server as any).llm = {
            generate: vi.fn().mockResolvedValue({ message: JSON.stringify({ improvement_needed: false }) })
        };
    }

    // Spy on performAnalysis
    // We assume performAnalysis is available on the instance (even if private in TS, it exists in JS)
    const spy = vi.spyOn(server as any, 'performAnalysis');

    // Mock return of performAnalysis to prevent actual execution if needed
    spy.mockResolvedValue({ content: [] });

    await server.performWeeklyReview();

    expect(spy).toHaveBeenCalledWith(50);
  });
});
