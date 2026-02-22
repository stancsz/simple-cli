import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onboardCompany } from '../../src/commands/onboard-company.js';
import * as fsPromises from 'fs/promises';
import { join } from 'path';

// Mock fs to capture writes and provide SOP content
vi.mock('fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof fsPromises>();
    return {
        ...actual,
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockImplementation(async (path: string) => {
            if (path.endsWith('onboarding_new_company.md')) {
                return `# Onboarding New Company

1. **Initialize Company Context**: Use the init_company tool.
2. **Initialize Brain**: Use brain_store.
3. **Create Sample SOP**: Use sop_create.
4. **Schedule Job Delegator**: Use scheduler_add_task.
5. **Schedule Reviewer**: Use scheduler_add_task.
6. **Schedule HR Review**: Use scheduler_add_task.
7. **Validate Onboarding**: Use validate_onboarding.
`;
            }
            if (path.endsWith('scheduler.json')) {
                return JSON.stringify({ tasks: [] });
            }
            return '';
        }),
        copyFile: vi.fn().mockResolvedValue(undefined),
        readdir: vi.fn().mockResolvedValue([]),
    };
});

vi.mock('fs', async () => {
    return {
        existsSync: vi.fn().mockReturnValue(true),
        mkdirSync: vi.fn(),
        statSync: vi.fn(),
    };
});

// Mock setupCompany to verify it is called
vi.mock('../../src/utils/company-setup.js', () => ({
    setupCompany: vi.fn().mockResolvedValue(undefined),
}));

// Mock proper-lockfile
vi.mock('proper-lockfile', () => ({
    default: {
        lock: vi.fn().mockResolvedValue(() => Promise.resolve()),
    },
    lock: vi.fn().mockResolvedValue(() => Promise.resolve()),
}));

// Mock MCP to use "real-ish" logic for side effects
vi.mock('../../src/mcp.js', () => {
    // We can't easily import outer scope variables into factory, so we use requires inside or just simple mocks that we can spy on later?
    // Spy on fsPromises.writeFile is better.

    return {
        MCP: class {
            async init() {}
            async startServer() {}
            isServerRunning() { return true; }
            async getTools() {
                // We define tools that simulate the real ones to trigger side effects
                const { setupCompany } = await import('../../src/utils/company-setup.js');
                const fs = await import('fs/promises');

                return [
                    {
                        name: 'init_company',
                        execute: async (args: any) => {
                            await setupCompany(args.name, args.context);
                            return "Company initialized";
                        }
                    },
                    { name: 'brain_store', execute: vi.fn().mockResolvedValue("Brain initialized") },
                    {
                        name: 'sop_create',
                        execute: async (args: any) => {
                            await fs.writeFile(`sops/${args.name}.md`, args.content);
                            return "SOP created";
                        }
                    },
                    {
                        name: 'scheduler_add_task',
                        execute: async (args: any) => {
                            await fs.writeFile('scheduler.json', JSON.stringify(args));
                            return "Task scheduled";
                        }
                    },
                    {
                        name: 'validate_onboarding',
                        execute: async (args: any) => {
                            await fs.writeFile(`report.md`, "Report");
                            return "Validation passed";
                        }
                    },
                    { name: 'mcp_start_server', execute: vi.fn().mockResolvedValue("Server started") },
                    { name: 'log_experience', execute: vi.fn().mockResolvedValue("Experience logged") },
                    { name: 'brain_query', execute: vi.fn().mockResolvedValue("No past experience") },
                ];
            }
        }
    }
});

// Mock LLM
vi.mock('../../src/llm.js', () => {
    const mockGenerate = vi.fn();

    // Step 1
    mockGenerate.mockResolvedValueOnce({ tool: 'init_company', args: { name: 'test-corp' }, message: 'Initializing...' });
    mockGenerate.mockResolvedValueOnce({ tool: 'complete_step', args: { summary: 'Done' } });

    // Step 2
    mockGenerate.mockResolvedValueOnce({ tool: 'brain_store', args: { taskId: 'init', request: 'init', solution: 'done' }, message: 'Brain...' });
    mockGenerate.mockResolvedValueOnce({ tool: 'complete_step', args: { summary: 'Done' } });

    // Step 3
    mockGenerate.mockResolvedValueOnce({ tool: 'sop_create', args: { name: 'hello_world', content: '...' }, message: 'SOP...' });
    mockGenerate.mockResolvedValueOnce({ tool: 'complete_step', args: { summary: 'Done' } });

    // Step 4
    mockGenerate.mockResolvedValueOnce({ tool: 'scheduler_add_task', args: { id: 'job-delegator' }, message: 'Scheduler...' });
    mockGenerate.mockResolvedValueOnce({ tool: 'complete_step', args: { summary: 'Done' } });

    // Step 5
    mockGenerate.mockResolvedValueOnce({ tool: 'scheduler_add_task', args: { id: 'reviewer' }, message: 'Scheduler...' });
    mockGenerate.mockResolvedValueOnce({ tool: 'complete_step', args: { summary: 'Done' } });

    // Step 6
    mockGenerate.mockResolvedValueOnce({ tool: 'scheduler_add_task', args: { id: 'hr-review' }, message: 'Scheduler...' });
    mockGenerate.mockResolvedValueOnce({ tool: 'complete_step', args: { summary: 'Done' } });

    // Step 7
    mockGenerate.mockResolvedValueOnce({ tool: 'validate_onboarding', args: { company_name: 'test-corp' }, message: 'Validate...' });
    mockGenerate.mockResolvedValueOnce({ tool: 'complete_step', args: { summary: 'Done' } });

    return {
        createLLM: () => ({
            generate: mockGenerate
        })
    }
});

// Mock UI
vi.mock('@clack/prompts', () => ({
    intro: vi.fn(),
    outro: vi.fn(),
    text: vi.fn(),
    isCancel: vi.fn(() => false),
    cancel: vi.fn(),
    log: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn()
    }
}));

describe('Onboarding SOP Integration', () => {
    it('should execute the full onboarding SOP flow and trigger side effects', async () => {
        await onboardCompany('test-corp');

        // Verify side effects
        const { setupCompany } = await import('../../src/utils/company-setup.js');
        expect(setupCompany).toHaveBeenCalledWith('test-corp', undefined);

        const fsPromises = await import('fs/promises');
        // Check scheduler write (triggered by scheduler_add_task mock)
        // We verify that it was called with content containing the job-delegator task
        expect(fsPromises.writeFile).toHaveBeenCalledWith('scheduler.json', expect.stringContaining('job-delegator'));

        // Check report write (triggered by validate_onboarding mock)
        expect(fsPromises.writeFile).toHaveBeenCalledWith('report.md', expect.anything());
    });
});
