import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/scheduler.js';
import { TaskDefinition } from '../../src/daemon/task_definitions.js';
import { MCP } from '../../src/mcp.js';
import { JobDelegator } from '../../src/scheduler/job_delegator.js';

// Mock the dependencies
vi.mock('../../src/mcp.js');
vi.mock('../../src/scheduler/job_delegator.js');

describe('Scheduler Ecosystem Routing (Phase 35)', () => {
    let scheduler: Scheduler;
    let mockMcpClient: any;
    let mockBrainClient: any;
    let mockOrchestratorClient: any;
    let mockDelegator: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mock MCP server behavior
        mockBrainClient = {
            callTool: vi.fn()
        };

        mockOrchestratorClient = {
            callTool: vi.fn()
        };

        const mcpInstance = {
            init: vi.fn().mockResolvedValue(undefined),
            listServers: vi.fn().mockReturnValue([
                { name: 'brain', status: 'started' },
                { name: 'agency_orchestrator', status: 'started' }
            ]),
            startServer: vi.fn().mockResolvedValue(undefined),
            getClient: vi.fn().mockImplementation((serverName: string) => {
                if (serverName === 'brain') return mockBrainClient;
                if (serverName === 'agency_orchestrator') return mockOrchestratorClient;
                return null;
            })
        };

        (MCP as any).mockImplementation(() => mcpInstance);

        // Setup mock Delegator behavior
        mockDelegator = {
            delegateTask: vi.fn().mockResolvedValue(undefined)
        };
        (JobDelegator as any).mockImplementation(() => mockDelegator);

        scheduler = new Scheduler('/tmp/mock_agent_dir');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should route task to local if use_ecosystem_patterns is false', async () => {
        const task: TaskDefinition = {
            id: 'task-1',
            name: 'Test Task',
            trigger: 'cron',
            prompt: 'Do something',
            use_ecosystem_patterns: false
        };

        // Bypass full start by directly testing `predictBestAgency`
        const predictedAgency = await scheduler.predictBestAgency(task);

        expect(predictedAgency).toBe('local');
        expect(mockBrainClient.callTool).not.toHaveBeenCalled();
    });

    it('should query brain for patterns and return local if no patterns found', async () => {
        const task: TaskDefinition = {
            id: 'task-2',
            name: 'Test Task',
            trigger: 'cron',
            prompt: 'Do something'
        };

        mockBrainClient.callTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: JSON.stringify({}) }]
        });

        const predictedAgency = await scheduler.predictBestAgency(task);

        expect(predictedAgency).toBe('local');
        expect(mockBrainClient.callTool).toHaveBeenCalledWith({
            name: 'analyze_ecosystem_patterns',
            arguments: {}
        });
    });

    it('should return predicted agency based on high success rate pattern', async () => {
        const task: TaskDefinition = {
            id: 'task-3',
            name: 'Specialized Task',
            trigger: 'cron',
            prompt: 'Do specialized work'
        };

        // Mock a pattern where child_agency_x is highly successful
        mockBrainClient.callTool.mockResolvedValueOnce({
            content: [{
                type: 'text',
                text: JSON.stringify({
                    agency_performance: [
                        { agency_id: 'local', success_rate: 0.5 },
                        { agency_id: 'child_agency_x', success_rate: 0.95 }
                    ]
                })
            }]
        });

        const predictedAgency = await scheduler.predictBestAgency(task);

        expect(predictedAgency).toBe('child_agency_x');
        expect(mockBrainClient.callTool).toHaveBeenCalled();
    });

    it('should assign task to predicted agency via orchestrator', async () => {
        const task: TaskDefinition = {
            id: 'task-4',
            name: 'Routing Task',
            trigger: 'cron',
            prompt: 'Do routed work',
            use_ecosystem_patterns: true
        };

        // Mock predictBestAgency returning the child agency
        vi.spyOn(scheduler, 'predictBestAgency').mockResolvedValue('child_agency_x');

        // Mock successful assignment
        mockOrchestratorClient.callTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'Task successfully assigned to child_agency_x' }],
            isError: false
        });

        // Test runTask flow
        // The private method `runTask` handles routing. We cast it as `any` to call it.
        await (scheduler as any).runTask(task);

        expect(scheduler.predictBestAgency).toHaveBeenCalledWith(task);

        expect(mockOrchestratorClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: 'assign_agency_to_task',
            arguments: expect.objectContaining({
                task_id: task.id,
                agency_config: expect.objectContaining({
                    agency_id: 'child_agency_x'
                })
            })
        }));

        // Because it was routed, local delegator should NOT be called
        expect(mockDelegator.delegateTask).not.toHaveBeenCalled();
    });

    it('should fallback to local delegation if orchestrator assignment fails', async () => {
        const task: TaskDefinition = {
            id: 'task-5',
            name: 'Fallback Task',
            trigger: 'cron',
            prompt: 'Do fallback work',
            use_ecosystem_patterns: true
        };

        vi.spyOn(scheduler, 'predictBestAgency').mockResolvedValue('child_agency_failed');

        // Mock failing assignment
        mockOrchestratorClient.callTool.mockResolvedValueOnce({
            content: [{ type: 'text', text: 'Spawning child agency failed' }],
            isError: true
        });

        await (scheduler as any).runTask(task);

        expect(scheduler.predictBestAgency).toHaveBeenCalledWith(task);
        expect(mockOrchestratorClient.callTool).toHaveBeenCalled();

        // Local delegator SHOULD be called due to fallback
        expect(mockDelegator.delegateTask).toHaveBeenCalledWith(task);
    });
});
