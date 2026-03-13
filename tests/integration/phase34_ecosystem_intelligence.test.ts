import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EpisodicMemory } from '../../src/brain/episodic';
import { analyzeEcosystemPatterns } from '../../src/mcp_servers/brain/tools/pattern_analysis';
import { proposeEcosystemPolicyUpdate } from '../../src/mcp_servers/brain/tools/strategy';

// Mock EpisodicMemory
vi.mock('../../src/brain/episodic', () => {
    return {
        EpisodicMemory: vi.fn().mockImplementation(() => {
            return {
                getRecentEpisodes: vi.fn().mockImplementation(async (company: string, limit: number) => {
                    return [
                        {
                            id: "mem1",
                            source_agency: "agency-design",
                            taskId: "task-1",
                            userPrompt: "Design new landing page",
                            agentResponse: "Completed with high visual quality score.",
                            timestamp: Date.now(),
                            type: "task_completion"
                        },
                        {
                            id: "mem2",
                            source_agency: "agency-design",
                            taskId: "task-2",
                            userPrompt: "Create logo",
                            agentResponse: "Completed. Client satisfaction is very high.",
                            timestamp: Date.now(),
                            type: "task_completion"
                        },
                        {
                            id: "mem3",
                            source_agency: "agency-backend",
                            taskId: "task-3",
                            userPrompt: "Optimize database",
                            agentResponse: "Failed due to high token consumption. Need better caching.",
                            timestamp: Date.now(),
                            type: "task_completion"
                        }
                    ];
                }),
                recall: vi.fn().mockImplementation(async (query: string) => {
                    return [];
                }),
                store: vi.fn().mockResolvedValue(true)
            };
        })
    };
});

// Mock LLM
const mockLLM = {
    generate: vi.fn(),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3])
};

// Mock Strategy Tools
vi.mock('../../src/mcp_servers/brain/tools/strategy', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        readStrategy: vi.fn().mockResolvedValue({
            vision: "Be the best AI agency",
            objectives: [],
            policies: {},
            timestamp: Date.now()
        }),
        proposeStrategicPivot: vi.fn().mockResolvedValue({
            vision: "Be the best AI agency",
            objectives: ["New Objective"],
            policies: {},
            timestamp: Date.now()
        })
    };
});

describe('Phase 34: Ecosystem Intelligence Validation', () => {
    let memory: EpisodicMemory;

    beforeEach(() => {
        vi.clearAllMocks();
        memory = new EpisodicMemory('test_dir');
    });

    it('should analyze ecosystem patterns correctly', async () => {
        const expectedReport = {
            summary: "Ecosystem shows strong design performance but backend inefficiencies.",
            themes: ["Design tasks succeed with high quality", "Backend tasks fail due to token limits"],
            performance_insights: ["agency-design outperforms agency-backend in efficiency"],
            bottlenecks: ["Database optimization consumes too many tokens"],
            recommended_global_actions: ["Implement global caching policy for backend agencies"]
        };

        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify(expectedReport)
        });

        const report = await analyzeEcosystemPatterns(memory, mockLLM as any);

        expect(memory.getRecentEpisodes).toHaveBeenCalledWith("default", 100);
        expect(mockLLM.generate).toHaveBeenCalledTimes(1);
        expect(report.summary).toBeDefined();
        expect(report.themes.length).toBeGreaterThan(0);
        expect(report.bottlenecks).toContain("Database optimization consumes too many tokens");
    });

    it('should propose ecosystem policy updates based on analysis', async () => {
        const ecosystemAnalysis = {
            summary: "Ecosystem shows strong design performance but backend inefficiencies.",
            themes: ["Design tasks succeed with high quality", "Backend tasks fail due to token limits"],
            performance_insights: ["agency-design outperforms agency-backend in efficiency"],
            bottlenecks: ["Database optimization consumes too many tokens"],
            recommended_global_actions: ["Implement global caching policy for backend agencies"]
        };

        const expectedProposal = {
            proposal: "All backend agencies must adopt strict caching layers.",
            rationale: "Addresses the token consumption bottleneck seen in agency-backend.",
            scope: "ecosystem"
        };

        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify(expectedProposal)
        });

        // mockLLM.generate needs to return a valid response for proposeStrategicPivot as well
        // since the mock was bypassed or proposeStrategicPivot was called with mockLLM
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify({
                vision: "Updated vision",
                objectives: ["New Obj"],
                policies: {},
                rationale: "Rationale"
            })
        });

        const result = await proposeEcosystemPolicyUpdate(memory, mockLLM as any, ecosystemAnalysis);

        expect(mockLLM.generate).toHaveBeenCalledTimes(2); // One for proposeEcosystemPolicyUpdate, one for proposeStrategicPivot
        expect(result.ecosystem_proposal.scope).toBe("ecosystem");
        expect(result.ecosystem_proposal.proposal).toBe(expectedProposal.proposal);
        // proposeStrategicPivot returns a pivot result
        expect(result.pivot_result).toBeDefined();
    });

    it('should handle empty ecosystem memories gracefully', async () => {
        (memory.getRecentEpisodes as any).mockResolvedValueOnce([]); // No memories

        const report = await analyzeEcosystemPatterns(memory, mockLLM as any);

        expect(report.summary).toContain("No cross-agency data available");
        expect(report.themes).toEqual([]);
        expect(mockLLM.generate).not.toHaveBeenCalled();
    });
});
