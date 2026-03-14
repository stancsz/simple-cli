import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSimulation } from "../../demos/phase35_ecosystem_optimization_simulation.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { createLLM } from "../../src/llm.js";
import * as llm from "../../src/llm.js";

const { mockMemoryStore } = vi.hoisted(() => {
    return {
        mockMemoryStore: {} as Record<string, any>
    };
});

vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: class {
            constructor() {}
            async store(taskId: string, request: string, solution: string, tags: string[], namespace?: string, ...args: any[]) {
                // ...args starts from simAttempts (index 5 of the original arguments)
                // type is the 12th argument overall, so it's args[6]
                // Let's just grab the last argument or fallback to args[6] if it exists
                const typeArg = args.length > 0 ? args[args.length - 1] : "unknown";
                const storedType = typeof typeArg === 'string' ? typeArg : "unknown";

                // id is the 9th argument overall, so args[3]
                const idArg = args.length >= 4 ? args[3] : taskId;
                const storedId = typeof idArg === 'string' && idArg ? idArg : taskId;

                mockMemoryStore[storedId] = { id: storedId, request, solution, tags, namespace, type: storedType };
                return true;
            }
            async recall(topic: string, limit: number, namespace: string, type?: string) {
                return Object.values(mockMemoryStore).filter(entry =>
                    (entry.id.includes(topic) || (entry.request && entry.request.includes(topic)) || (entry.type && entry.type.includes(topic))) &&
                    (!type || entry.type === type)
                ).slice(0, limit);
            }
            async getRecentEpisodes(limit: number, type?: string) {
                return Object.values(mockMemoryStore).filter(entry =>
                    (!type || entry.type === type)
                ).slice(0, limit);
            }
        }
    };
});

// Mock the Client to prevent real API calls from `assignTaskPredictively`
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
    return {
        Client: class MockClient {
            name: string;
            constructor(options: any) {
                this.name = options.name;
            }
            async connect() {}
            async close() {}
            async callTool(options: any) {
                return { content: [{ type: "text", text: JSON.stringify({ status: "mocked" }) }] };
            }
        }
    };
});

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
    return {
        StdioClientTransport: class MockTransport {
            constructor() {}
        }
    };
});

// Polyfill for proper-lockfile
vi.mock('proper-lockfile', () => ({
    default: {
        lock: vi.fn().mockResolvedValue(vi.fn())
    }
}));


describe("Phase 35 Validation: Ecosystem Optimization Simulation", () => {
    let llmInstance: any;
    let memory: any;

    beforeEach(() => {
        for (const key in mockMemoryStore) {
            delete mockMemoryStore[key];
        }

        const mockGenerate = vi.fn();
        let generateCallCount = 0;

        mockGenerate.mockImplementation(async (prompt: string, history: any[]) => {
            generateCallCount++;

            // 1. First set of calls (simulateTaskExecution - assignTaskPredictively) Baseline
            if (prompt.includes("You are an expert meta-orchestrator")) {
                return {
                    raw: JSON.stringify({
                        recommended_agency_id: "agency_alpha",
                        confidence_score: 0.9,
                        reasoning: "Best suited for general tasks."
                    })
                };
            }

            // 2. Propose Ecosystem Policy Update (first generate call)
            if (prompt.includes("You are an expert strategic advisor")) {
                return {
                    raw: JSON.stringify({
                        proposal: "Decrease routing latency and compute cost, increase max agents.",
                        rationale: "Simulation bottleneck detected.",
                        scope: "ecosystem"
                    })
                };
            }

            // 3. Propose Ecosystem Policy Update (second generate call inside proposeStrategicPivot)
            if (prompt.includes("You are a C-Suite executive")) {
                return {
                    raw: JSON.stringify({
                        vision: "Optimized Ecosystem",
                        objectives: ["Faster task execution"],
                        policies: { "scaling": "Aggressive scaling" },
                        rationale: "Meta-learning applied"
                    })
                };
            }

            // 4. Update Company with Ecosystem Insights (analyzeEcosystemPatterns)
            if (prompt.includes("Analyze the following cross-agency patterns")) {
                return {
                    raw: JSON.stringify({
                        insights: ["Increase agent pool", "Reduce latency"],
                        confidence: 0.95
                    })
                };
            }

            // 5. Apply Ecosystem Insights (parse policy)
            if (prompt.includes("You are the Ecosystem Optimization Engine")) {
                return {
                    raw: JSON.stringify({
                        target_agencies: "all",
                        parameters: {
                            max_agents: 10,
                            routing_latency_ms: 50,
                            compute_cost: 0.02
                        }
                    })
                };
            }

            // Fallback
            return { raw: JSON.stringify({
                        recommended_agency_id: "agency_alpha",
                        confidence_score: 0.9,
                        reasoning: "Best suited for general tasks."
                    }) };
        });

        vi.spyOn(llm, 'createLLM').mockReturnValue({
            generate: mockGenerate,
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        } as any);

        llmInstance = llm.createLLM();
        memory = new EpisodicMemory();
    });

    it("should orchestrate a federated project and demonstrate measurable efficiency improvements", async () => {
        const results = await runSimulation(memory, llmInstance);

        // Assert all 3 tools were called based on the results and memory state

        // 1. update_company_with_ecosystem_insights
        const companyInsightMemories = Object.values(mockMemoryStore).filter(m => m.type === "meta_learning_insight");
        expect(companyInsightMemories.length).toBeGreaterThan(0);

        // 2. apply_ecosystem_insights
        const optimizedConfig = mockMemoryStore["swarm_config:agency_alpha"];
        expect(optimizedConfig).toBeDefined();
        const configParsed = JSON.parse(optimizedConfig.solution);
        expect(configParsed.max_agents).toBe(10);
        expect(configParsed.routing_latency_ms).toBe(50);
        expect(configParsed.compute_cost).toBe(0.02);

        // 3. Efficiency improvements assertion (≥ 15% improvement)
        expect(results.durationImprovement).toBeGreaterThanOrEqual(15);
        expect(results.costImprovement).toBeGreaterThanOrEqual(15);

        // Ensure baseline was recorded
        expect(results.baselineMetrics.length).toBe(5);
        expect(results.optimizedMetrics.length).toBe(5);

        // Ensure assignTaskPredictively was called by checking assignments
        expect(results.baselineMetrics[0].agencyId).toBe("agency_alpha");
    });
});
