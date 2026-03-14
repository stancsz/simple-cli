import { describe, it, expect, vi, beforeEach } from 'vitest';
import { adjustEcosystemMorphology } from '../../src/mcp_servers/brain/tools/ecosystem_evolution.js';

// Define a simple mock episodic memory that matches the minimal interface used
class MockEpisodicMemory {
  storeCalls: any[] = [];
  async store(...args: any[]) {
    this.storeCalls.push(args);
  }
}

// Ensure the LLM used for pattern analysis does not throw unhandled errors during our mock tests
vi.mock('../../src/llm.js', () => {
    return {
        createLLM: vi.fn().mockReturnValue({
            generate: vi.fn().mockResolvedValue({ raw: "{}" }),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        })
    };
});

// Since the `ecosystem_evolution` uses `analyzeEcosystemPatterns` inside, we can also mock the analysis
// so it returns safely, but our tests here focus mostly on the rule-based structural logic.
vi.mock('../../src/mcp_servers/brain/tools/pattern_analysis.js', () => ({
    analyzeEcosystemPatterns: vi.fn().mockResolvedValue({ analysis: "mock insights" })
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
        expect(memory.storeCalls[0][1]).toBe("Adjust ecosystem morphology based on metrics");
        expect(memory.storeCalls[0][4]).toBe("ecosystem_morphology_decision");
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
        expect(spawnDecision?.reasoning).toContain('overloaded');
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
        expect(retireDecision?.reasoning).toContain('underperforming');
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
});
