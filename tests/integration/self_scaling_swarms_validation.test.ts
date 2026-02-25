import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scale_agents_for_project } from '../../src/mcp_servers/business_ops/tools/self_scaling_swarms.js';
import { MCP } from '../../src/mcp.js';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';

// Hoist mocks
const mocks = vi.hoisted(() => {
    return {
        mockLinearClient: {
            issues: vi.fn(),
            projects: vi.fn()
        },
        mockBrainClient: {
            callTool: vi.fn()
        },
        mockSwarmClient: {
            callTool: vi.fn()
        },
        mockMcpInstance: {
            init: vi.fn(),
            getClient: vi.fn()
        }
    };
});

// Mock Linear Service
vi.mock('../../src/mcp_servers/business_ops/linear_service.js', () => ({
    getLinearClient: () => mocks.mockLinearClient
}));

// Mock MCP
vi.mock('../../src/mcp.js', () => ({
    MCP: vi.fn(() => ({
        init: mocks.mockMcpInstance.init,
        getClient: (name: string) => {
            if (name === 'brain') return mocks.mockBrainClient;
            if (name === 'swarm') return mocks.mockSwarmClient;
            return null;
        }
    }))
}));

// Mock FS
vi.mock('fs', () => ({
    existsSync: vi.fn()
}));
vi.mock('fs/promises', () => ({
    readFile: vi.fn()
}));

describe('Self-Scaling Swarms Validation', () => {
    const projectId = "proj_123";

    beforeEach(() => {
        vi.clearAllMocks();

        // Reset default behaviors
        mocks.mockBrainClient.callTool.mockResolvedValue({ content: [] });
        mocks.mockSwarmClient.callTool.mockResolvedValue({
            content: [{ type: 'text', text: '[]' }]
        });
        mocks.mockLinearClient.issues.mockResolvedValue({ nodes: [] });

        // Mock FS for scaling rules
        (fs.existsSync as any).mockImplementation((path: string) => path.includes('scaling_rules.json'));
        (fsPromises.readFile as any).mockResolvedValue(JSON.stringify({
            rules: [
                {
                    condition: "open_high_priority_issues > 3",
                    action: "ensure_minimum_agents",
                    count: 2,
                    role: "Senior Developer",
                    priority: 2
                }
            ],
            max_agents_per_project: 5,
            min_agents_per_project: 0,
            scale_down_inactive_hours: 48
        }));
    });

    it('should spawn agents when high priority issues exceed threshold', async () => {
        // Mock 5 High Priority issues (Priority 2)
        mocks.mockLinearClient.issues.mockResolvedValue({
            nodes: [
                { id: '1', priority: 2, updatedAt: new Date() },
                { id: '2', priority: 2, updatedAt: new Date() },
                { id: '3', priority: 2, updatedAt: new Date() },
                { id: '4', priority: 2, updatedAt: new Date() },
                { id: '5', priority: 2, updatedAt: new Date() }
            ]
        });

        // Mock Spawn response
        mocks.mockSwarmClient.callTool.mockImplementation(async (args: any) => {
            if (args.name === 'spawn_subagent') {
                return { content: [{ type: 'text', text: JSON.stringify({ agent_id: 'agent_new' }) }] };
            }
            if (args.name === 'list_agents') {
                return { content: [{ type: 'text', text: '[]' }] };
            }
            return { content: [] };
        });

        const result = await scale_agents_for_project(projectId);

        // Desired should be 2 (from rule: >3 high priority -> 2 agents)
        expect(result.desiredAgents).toBe(2);

        // Expect spawn call
        expect(mocks.mockSwarmClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: 'spawn_subagent',
            arguments: expect.objectContaining({
                role: 'Senior Developer',
                company_id: projectId
            })
        }));

        // Expect Brain record call
        expect(mocks.mockBrainClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: 'brain_store',
            arguments: expect.objectContaining({
                type: 'agent_assignment',
                tags: expect.arrayContaining([projectId])
            })
        }));
    });

    it('should terminate agents when workload is low', async () => {
        // Mock 0 issues
        mocks.mockLinearClient.issues.mockResolvedValue({ nodes: [] });

        // Mock Brain has 2 active agents
        mocks.mockBrainClient.callTool.mockImplementation(async (args: any) => {
            if (args.name === 'brain_query') {
                return {
                    content: [
                        { type: 'text', text: `Active Agent: agent_1 for Project: ${projectId}` },
                        { type: 'text', text: `Active Agent: agent_2 for Project: ${projectId}` }
                    ]
                };
            }
            return { content: [] };
        });

        // Mock Swarm has those 2 agents running
        mocks.mockSwarmClient.callTool.mockImplementation(async (args: any) => {
             if (args.name === 'list_agents') {
                 return {
                    content: [{ type: 'text', text: JSON.stringify([
                        { id: 'agent_1' }, { id: 'agent_2' }
                    ]) }]
                };
             }
             if (args.name === 'terminate_agent') {
                 return { content: [{ type: 'text', text: 'Terminated' }] };
             }
             return { content: [] };
        });

        const result = await scale_agents_for_project(projectId);

        // Desired should be 0 (min)
        expect(result.desiredAgents).toBe(0);

        // Should terminate 2 agents
        // Check for terminate_agent call
        expect(mocks.mockSwarmClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: 'terminate_agent',
            arguments: { agent_id: 'agent_2' }
        }));
        expect(mocks.mockSwarmClient.callTool).toHaveBeenCalledWith(expect.objectContaining({
            name: 'terminate_agent',
            arguments: { agent_id: 'agent_1' }
        }));
    });

    it('should be idempotent (no action if already scaled)', async () => {
        // Mock 5 High Priority issues -> Need 2 agents
        mocks.mockLinearClient.issues.mockResolvedValue({
            nodes: [
                { id: '1', priority: 2, updatedAt: new Date() },
                { id: '2', priority: 2, updatedAt: new Date() },
                { id: '3', priority: 2, updatedAt: new Date() },
                { id: '4', priority: 2, updatedAt: new Date() },
                { id: '5', priority: 2, updatedAt: new Date() }
            ]
        });

        // Mock Brain has 2 agents
        mocks.mockBrainClient.callTool.mockImplementation(async (args: any) => {
            if (args.name === 'brain_query') {
                 return {
                    content: [
                        { type: 'text', text: `Active Agent: agent_1 for Project: ${projectId}` },
                        { type: 'text', text: `Active Agent: agent_2 for Project: ${projectId}` }
                    ]
                };
            }
            return { content: [] };
        });

        // Mock Swarm has 2 agents
        mocks.mockSwarmClient.callTool.mockImplementation(async (args: any) => {
             if (args.name === 'list_agents') {
                 return {
                    content: [{ type: 'text', text: JSON.stringify([
                        { id: 'agent_1' }, { id: 'agent_2' }
                    ]) }]
                };
             }
             return { content: [] };
        });

        const result = await scale_agents_for_project(projectId);

        expect(result.desiredAgents).toBe(2);

        // Expect NO spawn/terminate calls
        const calls = mocks.mockSwarmClient.callTool.mock.calls;
        const actionCalls = calls.filter((c: any) => c[0].name === 'spawn_subagent' || c[0].name === 'terminate_agent');
        expect(actionCalls.length).toBe(0);
    });
});
