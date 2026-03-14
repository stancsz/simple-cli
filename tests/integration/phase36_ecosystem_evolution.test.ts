import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adjustEcosystemMorphology } from '../../src/mcp_servers/brain/tools/ecosystem_evolution.js';

// Define a simple mock episodic memory that matches the minimal interface used
class MockEpisodicMemory {
  storeCalls: any[] = [];
  async store(...args: any[]) {
    this.storeCalls.push(args);
  }
}

// Mock @modelcontextprotocol/sdk/client/index.js
const mockCallTool = vi.fn().mockResolvedValue({
    content: [{ text: JSON.stringify({ status: "healthy", score: 95 }) }]
});

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    return {
        Client: vi.fn().mockImplementation(() => ({
            connect: vi.fn().mockResolvedValue(undefined),
            callTool: mockCallTool,
            close: vi.fn().mockResolvedValue(undefined)
        }))
    };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
    return {
        StdioClientTransport: vi.fn().mockImplementation(() => ({}))
    };
});

// Mock LLM to return different outcomes based on the prompt content
vi.mock('../../src/llm.js', () => {
    return {
        createLLM: vi.fn().mockReturnValue({
            generate: vi.fn().mockImplementation(async (sys: string, msgs: any[]) => {
                const prompt = msgs[0].content;
                let decisions = [];

                if (prompt.includes('agency_healthy_1')) {
                    decisions = [{
                        action: 'maintain',
                        target_agencies: [],
                        rationale: 'Agencies are healthy.',
                        expected_impact: 'System remains in current state.'
                    }];
                } else if (prompt.includes('agency_bottleneck_1')) {
                    decisions = [{
                        action: 'spawn',
                        target_agencies: [],
                        rationale: 'Agency is overloaded.',
                        expected_impact: 'Load balanced.',
                        config: { role: 'developer', resource_limit: 50000 }
                    }];
                } else if (prompt.includes('agency_failing_1') || prompt.includes('agency_inefficient_1')) {
                    const failingId = prompt.includes('agency_failing_1') ? 'agency_failing_1' : 'agency_inefficient_1';
                    decisions = [{
                        action: 'retire',
                        target_agencies: [failingId],
                        rationale: 'Agency is underperforming.',
                        expected_impact: 'Freed resources.'
                    }];
                } else if (prompt.includes('agency_idle_1')) {
                    decisions = [{
                        action: 'merge',
                        target_agencies: ['agency_idle_1', 'agency_idle_2'],
                        rationale: 'Agencies are underutilized.',
                        expected_impact: 'Optimized resources.',
                        config: { merge_into: 'agency_idle_1' }
                    }];
                } else {
                    // Complex scenario
                    decisions = [
                        { action: 'retire', target_agencies: ['agency_failing'], rationale: 'failing', expected_impact: 'freed' },
                        { action: 'spawn', target_agencies: [], rationale: 'overloaded', expected_impact: 'balanced', config: { role: 'engineer' } },
                        { action: 'merge', target_agencies: ['agency_merge_1', 'agency_merge_2'], rationale: 'idle', expected_impact: 'optimized', config: { merge_into: 'agency_merge_1' } }
                    ];
                }

                return { raw: JSON.stringify(decisions) };
            }),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        })
    };
});

vi.mock('../../src/mcp_servers/brain/tools/pattern_analysis.js', () => ({
    analyzeEcosystemPatterns: vi.fn().mockResolvedValue({ analysis: "mock insights" })
}));

vi.mock('../../src/mcp_servers/brain/tools/market_shock.js', () => ({
    monitorMarketSignals: vi.fn().mockResolvedValue({ status: "stable" })
}));

describe('Phase 36: Autonomous Ecosystem Evolution', () => {
    let memory: any;

    beforeEach(() => {
        memory = new MockEpisodicMemory();
        vi.clearAllMocks();
    });

    it('should maintain the ecosystem when agencies are healthy and within thresholds', async () => {
        const input = {
            agency_statuses: [
                {
                    agency_id: 'agency_healthy_1',
                    role: 'researcher',
                    tasks_assigned: 3,
                    tasks_failed: 0,
                    utilization_rate: 0.5,
                    token_efficiency: 0.8
                }
            ]
        };

        const decisions = await adjustEcosystemMorphology(input, memory);
        expect(decisions).toHaveLength(1);
        expect(decisions[0].action).toBe('maintain');

        expect(memory.storeCalls.length).toBe(1);
        expect(memory.storeCalls[0][1]).toBe("Adjust ecosystem morphology based on metrics, market signals, and meta-learning");
        expect(memory.storeCalls[0][4]).toBe("ecosystem_morphology_proposal");
    });

    it('should spawn a new agency when utilization is high and there is a bottleneck', async () => {
        const input = {
            agency_statuses: [
                {
                    agency_id: 'agency_bottleneck_1',
                    role: 'developer',
                    tasks_assigned: 10,
                    tasks_failed: 0,
                    utilization_rate: 0.95, // Above 0.85
                    token_efficiency: 0.9
                }
            ]
        };

        const decisions = await adjustEcosystemMorphology(input, memory);

        const spawnDecision = decisions.find(d => d.action === 'spawn');
        expect(spawnDecision).toBeDefined();
        expect(spawnDecision?.config?.role).toBe('developer');
        expect(spawnDecision?.rationale).toContain('overloaded');
    });

    it('should retire an agency that is severely underperforming', async () => {
        const input = {
            agency_statuses: [
                {
                    agency_id: 'agency_failing_1',
                    role: 'qa_tester',
                    tasks_assigned: 10,
                    tasks_failed: 5, // 50% failure rate > 40% threshold
                    utilization_rate: 0.15, // < 20% threshold
                    token_efficiency: 0.5
                }
            ]
        };

        const decisions = await adjustEcosystemMorphology(input, memory);

        const retireDecision = decisions.find(d => d.action === 'retire');
        expect(retireDecision).toBeDefined();
        expect(retireDecision?.target_agencies).toContain('agency_failing_1');
        expect(retireDecision?.rationale).toContain('underperforming');
    });

    it('should retire an agency due to critically low token efficiency', async () => {
        const input = {
            agency_statuses: [
                {
                    agency_id: 'agency_inefficient_1',
                    role: 'summarizer',
                    tasks_assigned: 5,
                    tasks_failed: 0,
                    utilization_rate: 0.5,
                    token_efficiency: 0.2 // < 0.30 threshold
                }
            ]
        };

        const decisions = await adjustEcosystemMorphology(input, memory);

        const retireDecision = decisions.find(d => d.action === 'retire');
        expect(retireDecision).toBeDefined();
        expect(retireDecision?.target_agencies).toContain('agency_inefficient_1');
    });

    it('should merge underutilized agencies of the same role', async () => {
        const input = {
            agency_statuses: [
                {
                    agency_id: 'agency_idle_1',
                    role: 'data_entry',
                    tasks_assigned: 1,
                    tasks_failed: 0,
                    utilization_rate: 0.1, // < 0.4
                    token_efficiency: 0.9
                },
                {
                    agency_id: 'agency_idle_2',
                    role: 'data_entry',
                    tasks_assigned: 2,
                    tasks_failed: 0,
                    utilization_rate: 0.15, // < 0.4
                    token_efficiency: 0.85
                }
            ]
        };

        const decisions = await adjustEcosystemMorphology(input, memory);

        const mergeDecision = decisions.find(d => d.action === 'merge');
        expect(mergeDecision).toBeDefined();
        expect(mergeDecision?.target_agencies).toContain('agency_idle_1');
        expect(mergeDecision?.target_agencies).toContain('agency_idle_2');
        expect(mergeDecision?.config?.merge_into).toBe('agency_idle_1'); // Defaults to the first one in the list
    });

    it('should handle complex ecosystem scenarios properly', async () => {
        const input = {
            agency_statuses: [
                // Needs retirement
                {
                    agency_id: 'agency_failing',
                    role: 'designer',
                    tasks_assigned: 10,
                    tasks_failed: 8,
                    utilization_rate: 0.1,
                    token_efficiency: 0.1
                },
                // Needs spawning
                {
                    agency_id: 'agency_overloaded',
                    role: 'engineer',
                    tasks_assigned: 20,
                    tasks_failed: 1,
                    utilization_rate: 0.95,
                    token_efficiency: 0.85
                },
                // Needs merging
                {
                    agency_id: 'agency_merge_1',
                    role: 'writer',
                    tasks_assigned: 2,
                    tasks_failed: 0,
                    utilization_rate: 0.2,
                    token_efficiency: 0.9
                },
                {
                    agency_id: 'agency_merge_2',
                    role: 'writer',
                    tasks_assigned: 1,
                    tasks_failed: 0,
                    utilization_rate: 0.3,
                    token_efficiency: 0.8
                }
            ]
        };

        const decisions = await adjustEcosystemMorphology(input, memory);

        // Should have 1 retire, 1 merge, 1 spawn
        expect(decisions).toHaveLength(3);

        const actions = decisions.map(d => d.action);
        expect(actions).toContain('retire');
        expect(actions).toContain('spawn');
        expect(actions).toContain('merge');

        // Verify that the failing agency isn't also considered for merging
        const failingMergeDecision = decisions.find(d => d.action === 'merge' && d.target_agencies.includes('agency_failing'));
        expect(failingMergeDecision).toBeUndefined();
    });

    it('should execute spawn action via Agency Orchestrator', async () => {
        mockCallTool.mockResolvedValueOnce({
            content: [{ text: JSON.stringify({ agency_id: 'new_agency_123' }) }]
        });

        const input = {
            agency_statuses: [
                {
                    agency_id: 'agency_bottleneck_1',
                    role: 'developer',
                    tasks_assigned: 10,
                    tasks_failed: 0,
                    utilization_rate: 0.95,
                    token_efficiency: 0.9
                }
            ]
        };

        await adjustEcosystemMorphology(input, memory);

        expect(mockCallTool).toHaveBeenCalledWith({
            name: "spawn_child_agency",
            arguments: {
                role: 'developer',
                initial_context: expect.stringContaining('overloaded'),
                resource_limit: 50000,
                swarm_config: {}
            }
        });
    });

    it('should execute merge action via Agency Orchestrator', async () => {
        mockCallTool.mockResolvedValueOnce({
            content: [{ text: JSON.stringify({ status: 'merged' }) }]
        });

        const input = {
            agency_statuses: [
                {
                    agency_id: 'agency_idle_1',
                    role: 'data_entry',
                    tasks_assigned: 1,
                    tasks_failed: 0,
                    utilization_rate: 0.1,
                    token_efficiency: 0.9
                },
                {
                    agency_id: 'agency_idle_2',
                    role: 'data_entry',
                    tasks_assigned: 2,
                    tasks_failed: 0,
                    utilization_rate: 0.15,
                    token_efficiency: 0.85
                }
            ]
        };

        await adjustEcosystemMorphology(input, memory);

        expect(mockCallTool).toHaveBeenCalledWith({
            name: "merge_child_agencies",
            arguments: {
                source_agency_id: 'agency_idle_2', // Not merge_into
                target_agency_id: 'agency_idle_1'
            }
        });
    });

    it('should execute retire action via Agency Orchestrator', async () => {
        mockCallTool.mockResolvedValueOnce({
            content: [{ text: JSON.stringify({ status: 'retired' }) }]
        });

        const input = {
            agency_statuses: [
                {
                    agency_id: 'agency_failing_1',
                    role: 'qa_tester',
                    tasks_assigned: 10,
                    tasks_failed: 5,
                    utilization_rate: 0.15,
                    token_efficiency: 0.5
                }
            ]
        };

        await adjustEcosystemMorphology(input, memory);

        expect(mockCallTool).toHaveBeenCalledWith({
            name: "retire_child_agency",
            arguments: {
                agency_id: 'agency_failing_1'
            }
        });
    });
});
