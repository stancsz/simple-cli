import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateStrategicInitiativesLogic } from '../../src/mcp_servers/business_ops/tools/strategic_execution.js';
import { MCP } from '../../src/mcp.js';

// Setup default process env for API keys needed by clients
process.env.LINEAR_API_KEY = "test-linear-api-key";

// --- Mocking External Dependencies ---

// 1. Mock Brain Episodic Memory
vi.mock('../../src/brain/episodic.js', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => ({
            init: vi.fn().mockResolvedValue(undefined),
            store: vi.fn().mockResolvedValue(undefined),
            recall: vi.fn().mockResolvedValue([])
        }))
    };
});

// 2. Mock MCP behavior
vi.mock('../../src/mcp.js', () => {
    return {
        MCP: vi.fn().mockImplementation(() => {
            return {
                init: vi.fn().mockResolvedValue(undefined),
                getTools: vi.fn().mockResolvedValue([
                    {
                        name: "read_strategy",
                        execute: vi.fn().mockResolvedValue({
                            content: [{
                                text: JSON.stringify({
                                    vision: "To be the premier AI operations agency.",
                                    objectives: [
                                        "Increase enterprise client retention by 20%",
                                        "Improve fleet delivery efficiency by 15%"
                                    ],
                                    policies: {},
                                    timestamp: Date.now()
                                })
                            }]
                        })
                    },
                    {
                        name: "analyze_performance_metrics",
                        execute: vi.fn().mockResolvedValue({
                            content: [{
                                text: JSON.stringify({
                                    period: "last_30_days",
                                    financial: { revenue: 50000, profit: 15000, margin: 0.3, outstanding: 2000 },
                                    delivery: { velocity: 15, cycleTime: 8, efficiency: 0.65, openIssues: 10, completedIssues: 15 },
                                    client: { nps: 45, churnRate: 0.08, activeClients: 8, satisfactionScore: 65 },
                                    timestamp: new Date().toISOString()
                                })
                            }]
                        })
                    },
                    {
                        name: "get_fleet_status",
                        execute: vi.fn().mockResolvedValue({
                            content: [{
                                text: JSON.stringify([
                                    {
                                        company: "Acme Corp",
                                        projectId: "proj-1",
                                        active_agents: 2,
                                        pending_issues: 12,
                                        health: "strained",
                                        last_updated: new Date()
                                    },
                                    {
                                        company: "Global Tech",
                                        projectId: "proj-2",
                                        active_agents: 1,
                                        pending_issues: 3,
                                        health: "healthy",
                                        last_updated: new Date()
                                    }
                                ])
                            }]
                        })
                    }
                ])
            };
        })
    };
});

// 3. Mock Linear Service
vi.mock('../../src/mcp_servers/business_ops/linear_service.js', () => {
    return {
        createProject: vi.fn().mockResolvedValue({
            id: "linear-project-123",
            url: "https://linear.app/project/123",
            name: "Strategic Initiatives",
            action: "created"
        }),
        createIssue: vi.fn().mockImplementation(async (projectId, title, description, priority) => {
            return {
                id: `issue-${Math.random().toString(36).substring(7)}`,
                url: `https://linear.app/issue/${Math.random().toString(36).substring(7)}`,
                identifier: `STRAT-${Math.floor(Math.random() * 100)}`,
                title
            };
        })
    };
});

// 4. Mock LLM for deterministic behavior
vi.mock('../../src/llm.js', () => {
    return {
        createLLM: vi.fn().mockReturnValue({
            generate: vi.fn().mockResolvedValue({
                message: JSON.stringify({
                    initiatives: [
                        {
                            title: "Improve Client NPS Outreach",
                            description: "Client satisfaction score is currently 65 vs our retention objective. Implement a direct outreach program.",
                            priority: 1
                        },
                        {
                            title: "Optimize Delivery Cycle Time",
                            description: "Delivery efficiency is 65%. We need to reduce cycle time to hit the 15% improvement target.",
                            priority: 2
                        },
                        {
                            title: "Balance Strained Swarms",
                            description: "Acme Corp is showing a strained fleet health with 12 pending issues. Allocate additional agents immediately.",
                            priority: 1
                        }
                    ],
                    rationale: "Identified a disconnect between the retention objective and low NPS/strained fleet status."
                }),
                thought: "Analyzing the gap..."
            })
        })
    };
});

describe('Strategic Execution Logic', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should successfully translate strategy to actionable linear issues via MCP tool calls', async () => {
        const mcpMock = new MCP();

        // Execute the tool logic directly
        const result = await generateStrategicInitiativesLogic(mcpMock);

        // Validate the structure of the returned response
        expect(result).toHaveProperty('rationale');
        expect(result).toHaveProperty('initiatives_created');
        expect(result.initiatives_created).toHaveLength(3);

        // Validate that each initiative has successful creation attributes
        for (const initiative of result.initiatives_created) {
            expect(initiative.status).toBe('created');
            expect(initiative).toHaveProperty('title');
            expect(initiative).toHaveProperty('url');
            expect(initiative).toHaveProperty('identifier');
        }

        // Validate MCP interactions
        expect(mcpMock.init).toHaveBeenCalledTimes(1);
        expect(mcpMock.getTools).toHaveBeenCalledTimes(1);

        // Validate Linear API calls
        const { createProject, createIssue } = await import('../../src/mcp_servers/business_ops/linear_service.js');
        expect(createProject).toHaveBeenCalledTimes(1);
        expect(createProject).toHaveBeenCalledWith("global", "Global Strategic Initiatives", expect.any(String));

        expect(createIssue).toHaveBeenCalledTimes(3);

        // Assert on the specific arguments of the first createIssue call
        const firstIssueCall = vi.mocked(createIssue).mock.calls[0];
        expect(firstIssueCall[0]).toBe("linear-project-123"); // projectId
        expect(firstIssueCall[1]).toBe("Improve Client NPS Outreach"); // title
        expect(firstIssueCall[2]).toContain("Client satisfaction score is currently 65"); // description text
        expect(firstIssueCall[2]).toContain("*Auto-generated from Strategic Execution Engine.*"); // description attribution
        expect(firstIssueCall[3]).toBe(1); // priority
    });

});