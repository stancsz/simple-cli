import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSchedule } from '../../src/daemon.js';
import { executeTask } from '../../src/scheduler/executor.js';
import { TaskDefinition } from '../../src/interfaces/daemon.js';

// Mock MCP
const mockCallTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Success' }] });
const mockGetClient = vi.fn(() => ({
    callTool: mockCallTool
}));
const mockStartServer = vi.fn().mockResolvedValue(true);
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockIsServerRunning = vi.fn().mockReturnValue(false);

vi.mock('../../src/mcp.js', () => {
    return {
        MCP: vi.fn().mockImplementation(() => ({
            init: mockInit,
            isServerRunning: mockIsServerRunning,
            startServer: mockStartServer,
            getClient: mockGetClient,
            listServers: vi.fn().mockReturnValue([])
        }))
    };
});

// Mock dependencies of executor
vi.mock('../../src/engine/orchestrator.js', () => ({
    Context: vi.fn(),
    Registry: vi.fn()
}));
vi.mock('../../src/llm.js', () => ({
    createLLM: vi.fn()
}));
vi.mock('../../src/skills.js', () => ({
    getActiveSkill: vi.fn().mockResolvedValue({ systemPrompt: '' })
}));

describe('Scheduler HR Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset default mock implementations if needed
        mockIsServerRunning.mockReturnValue(false);
    });

    it('should load the Weekly HR Review task by default', async () => {
        const config = await loadSchedule();
        const hrTask = config.tasks.find(t => t.id === 'weekly_hr_review');
        expect(hrTask).toBeDefined();
        expect(hrTask?.name).toBe('Weekly HR Review');
        expect(hrTask?.action).toBe('mcp.call_tool');
        expect(hrTask?.schedule).toBe('0 12 * * 0');
        expect(hrTask?.args?.server).toBe('hr');
        expect(hrTask?.args?.tool).toBe('perform_weekly_review');
    });

    it('should execute the HR tool directly via mcp.call_tool action and inject context', async () => {
        const taskDef: TaskDefinition = {
            id: 'test_hr_review',
            name: 'Test HR Review',
            trigger: 'cron',
            action: 'mcp.call_tool',
            company: 'Acme Corp',
            args: {
                server: 'hr',
                tool: 'perform_weekly_review',
                arguments: { foo: 'bar' }
            }
        };

        await executeTask(taskDef);

        expect(mockInit).toHaveBeenCalled();
        expect(mockStartServer).toHaveBeenCalledWith('hr');
        expect(mockGetClient).toHaveBeenCalledWith('hr');
        expect(mockCallTool).toHaveBeenCalledWith({
            name: 'perform_weekly_review',
            arguments: {
                foo: 'bar',
                projectRoot: process.cwd(),
                company: 'Acme Corp'
            }
        });
    });

    it('should not start server if already running', async () => {
         const taskDef: TaskDefinition = {
            id: 'test_hr_review_running',
            name: 'Test HR Review Running',
            trigger: 'cron',
            action: 'mcp.call_tool',
            args: {
                server: 'hr',
                tool: 'perform_weekly_review',
                arguments: {}
            }
        };

        mockIsServerRunning.mockReturnValue(true);

        await executeTask(taskDef);

        expect(mockInit).toHaveBeenCalled();
        expect(mockStartServer).not.toHaveBeenCalled(); // Should NOT be called
        expect(mockGetClient).toHaveBeenCalledWith('hr');
        expect(mockCallTool).toHaveBeenCalledWith({
            name: 'perform_weekly_review',
            arguments: {
                projectRoot: process.cwd(),
                company: undefined
            }
        });
    });
});
