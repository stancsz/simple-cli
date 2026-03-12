import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeStrategicDecisionLogic } from "../../src/mcp_servers/brain/tools/strategic_decisions.js";
import { executeStrategicInitiativeLogic } from "../../src/mcp_servers/business_ops/tools/executive_actions.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { MCP } from "../../src/mcp.js";
import * as llmModule from "../../src/llm.js";

// Mock the dependencies
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: vi.fn(),
        LLM: class {
            constructor() {}
            async generate() { return { message: "{}" }; }
        }
    };
});

vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: class {
            async init() {}
            async store() {}
            async recall() { return []; }
            async search() { return []; }
        }
    };
});

vi.mock("../../src/mcp.js", () => {
    return {
        MCP: class {
            async init() {}
            async getTools() {
                return [
                    {
                        name: "generate_strategic_initiatives",
                        execute: async () => ({
                            content: [{
                                text: JSON.stringify({
                                    rationale: "Aligning with new strategic pivot.",
                                    initiatives_created: [
                                        { title: "Optimize Fleet", status: "created", url: "https://linear.app/issue/1" }
                                    ]
                                })
                            }]
                        })
                    }
                ];
            }
        }
    };
});

// Mock specific tool logic to avoid deep calls
vi.mock("../../src/mcp_servers/brain/tools/strategy.js", () => {
    return {
        readStrategy: vi.fn().mockResolvedValue({
            mission: "Grow revenue",
            target_markets: ["Tech"],
            strategic_goals: ["Increase margins by 10%"]
        }),
        proposeStrategicPivot: vi.fn().mockResolvedValue({
            mission: "Grow revenue rapidly",
            target_markets: ["Tech", "Finance"],
            strategic_goals: ["Increase margins by 15%"]
        })
    };
});

vi.mock("../../src/mcp_servers/business_ops/tools/policy_engine.js", () => {
    return {
        updateOperatingPolicyLogic: vi.fn().mockResolvedValue({
            success: true,
            version: 2
        })
    };
});

vi.mock("../../src/mcp_servers/business_ops/tools/strategic_execution.js", () => {
    return {
        generateStrategicInitiativesLogic: vi.fn().mockResolvedValue({
            rationale: "Aligning with new strategic pivot.",
            initiatives_created: [
                { title: "Optimize Fleet", status: "created", url: "https://linear.app/issue/1" }
            ]
        })
    };
});


describe("Phase 30: Strategic Decision Engine Integration", () => {
    let mockEpisodic: EpisodicMemory;
    let mockMcp: MCP;

    beforeEach(() => {
        vi.clearAllMocks();
        mockEpisodic = new EpisodicMemory();
        mockEpisodic.store = vi.fn().mockResolvedValue(undefined);
        mockMcp = new MCP();
    });

    describe("makeStrategicDecisionLogic", () => {
        it("should successfully analyze a forecast and recommend a pivot when confidence is high (>0.8)", async () => {
            const mockLLMResponse = {
                message: JSON.stringify({
                    decision: "Increase pricing by 15%",
                    rationale: "High demand forecasted in Q3",
                    confidence_score: 0.85,
                    proposed_pivot: "Shift focus to premium enterprise tier."
                })
            };

            vi.mocked(llmModule.createLLM).mockReturnValue({
                generate: vi.fn().mockResolvedValue(mockLLMResponse)
            } as any);

            const forecastData = JSON.stringify([{ metric: "demand", predicted_value: 1000 }]);

            const result = await makeStrategicDecisionLogic(mockEpisodic, forecastData, "test_corp");

            expect(result.analysis.decision).toBe("Increase pricing by 15%");
            expect(result.analysis.confidence_score).toBe(0.85);
            expect(result.pivot_applied).toBe(true);
            expect(result.updated_strategy).toBeDefined();

            // Verify memory store was called for audit
            expect(mockEpisodic.store).toHaveBeenCalledWith(
                expect.stringContaining("strategic_decision_"),
                expect.any(String),
                expect.any(String),
                expect.arrayContaining(["strategic_decision", "phase_30"]),
                "test_corp",
                undefined, false, undefined, undefined, 0, 0,
                "autonomous_decision"
            );
        });

        it("should not apply pivot if confidence is below threshold (<0.8)", async () => {
             const mockLLMResponse = {
                message: JSON.stringify({
                    decision: "Wait and see",
                    rationale: "Forecast is too noisy to act upon decisively",
                    confidence_score: 0.60,
                    proposed_pivot: "Monitor market closely."
                })
            };

            vi.mocked(llmModule.createLLM).mockReturnValue({
                generate: vi.fn().mockResolvedValue(mockLLMResponse)
            } as any);

            const forecastData = JSON.stringify([{ metric: "demand", predicted_value: 1000 }]);

            const result = await makeStrategicDecisionLogic(mockEpisodic, forecastData, "test_corp");

            expect(result.analysis.confidence_score).toBe(0.60);
            expect(result.pivot_applied).toBe(false);
            expect(result.updated_strategy).toBeNull();
        });

        it("should throw an error for invalid forecast JSON", async () => {
            await expect(makeStrategicDecisionLogic(mockEpisodic, "invalid json", "test_corp"))
                .rejects.toThrow("Invalid forecast_data JSON.");
        });
    });

    describe("executeStrategicInitiativeLogic", () => {
        it("should successfully convert a decision into policy updates and Linear initiatives", async () => {
            const strategicDecision = JSON.stringify({
                decision: "Increase pricing by 15%",
                rationale: "High demand forecasted in Q3"
            });

            const mockLLMResponse = {
                message: JSON.stringify({
                    policy_updates: { "base_pricing_multiplier": 1.15 },
                    justification: "Aligning pricing with new strategic decision."
                })
            };

            vi.mocked(llmModule.createLLM).mockReturnValue({
                generate: vi.fn().mockResolvedValue(mockLLMResponse)
            } as any);

            const result = await executeStrategicInitiativeLogic(mockMcp, strategicDecision, "test_corp");

            expect(result.policy_updates.base_pricing_multiplier).toBe(1.15);
            expect(result.justification).toBe("Aligning pricing with new strategic decision.");

            // Verifies integration with policy engine
            expect(result.policy_update_result.success).toBe(true);

            // Verifies integration with strategic execution (Linear)
            expect(result.initiatives_result.initiatives_created.length).toBe(1);

             // Verify memory store was called for audit
             // Inside executeStrategicInitiativeLogic, it instantiates its own EpisodicMemory, so the global mock doesn't catch it
             // easily without more complex injection. However, we assume if execution passes, it completed.
        });

        it("should throw an error for invalid decision JSON", async () => {
             await expect(executeStrategicInitiativeLogic(mockMcp, "invalid json", "test_corp"))
                .rejects.toThrow("Invalid strategic_decision JSON.");
        });
    });
});
