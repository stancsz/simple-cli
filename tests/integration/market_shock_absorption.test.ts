import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import {
    monitorMarketSignals,
    evaluateEconomicRisk,
    triggerContingencyPlan
} from "../../src/mcp_servers/brain/tools/market_shock.js";
import { CorporateStrategy } from "../../src/brain/schemas.js";

// Mock the LLM
const mockLLM = {
    generate: vi.fn(),
    embedMany: vi.fn(),
    embed: vi.fn(),
    countTokens: vi.fn(),
};

// Mock EpisodicMemory
const mockEpisodic = {
    store: vi.fn(),
    recall: vi.fn(),
} as unknown as EpisodicMemory;

describe("Market Shock Absorption (Phase 27)", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should generate market signals with expected structure", async () => {
        const signals = await monitorMarketSignals();
        expect(signals).toHaveProperty("sectors");
        expect(signals).toHaveProperty("macro");
        expect(signals).toHaveProperty("timestamp");
        expect(Object.keys(signals.sectors).length).toBeGreaterThan(0);
        expect(["rising", "stable", "falling"]).toContain(signals.macro.interest_rate_trend);
    });

    it("should evaluate economic risk as HIGH and parse JSON response correctly", async () => {
        const mockSignals = {
            sectors: {
                "tech": { performance: -25.5, volatility: 8.5 }
            },
            macro: {
                interest_rate_trend: "rising" as const,
                inflation_trend: "rising" as const,
                consumer_confidence: 20
            },
            timestamp: Date.now()
        };

        const mockStrategy: CorporateStrategy = {
            vision: "Be the best tech agency",
            objectives: ["Dominate tech sector"],
            policies: { min_margin: 0.2 },
            timestamp: Date.now()
        };

        // Mock LLM to return a High risk assessment
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify({
                risk_level: "high",
                vulnerability_score: 95,
                rationale: "Heavy exposure to a crashing tech sector."
            })
        });

        const assessment = await evaluateEconomicRisk(mockSignals, mockStrategy, mockLLM as any);

        expect(assessment.risk_level).toBe("high");
        expect(assessment.vulnerability_score).toBe(95);
        expect(assessment.rationale).toBeDefined();
        expect(mockLLM.generate).toHaveBeenCalledTimes(1);
    });

    it("should trigger contingency plan and update corporate strategy in EpisodicMemory", async () => {
        const mockRiskAssessment = {
            risk_level: "high" as const,
            vulnerability_score: 95,
            rationale: "Heavy exposure to a crashing tech sector."
        };

        const mockStrategy: CorporateStrategy = {
            vision: "Be the best tech agency",
            objectives: ["Dominate tech sector"],
            policies: { min_margin: 0.2 },
            timestamp: Date.now()
        };

        // Mock LLM to return a contingency strategy update
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify({
                vision: "Be the best tech agency",
                objectives: ["Dominate tech sector", "Survive market crash"],
                policies: {
                    min_margin: 0.2,
                    pause_non_critical_swarms: true,
                    adjust_pricing_margin: -0.15
                },
                rationale: "Triggering defensive posture due to high market risk."
            })
        });

        const newStrategy = await triggerContingencyPlan(mockRiskAssessment, mockStrategy, mockEpisodic, mockLLM as any, "test_company");

        expect(newStrategy.policies).toHaveProperty("pause_non_critical_swarms", true);
        expect(newStrategy.policies).toHaveProperty("adjust_pricing_margin", -0.15);
        expect(newStrategy.objectives).toContain("Survive market crash");

        // Verify it was stored in memory
        expect(mockEpisodic.store).toHaveBeenCalledTimes(1);
        expect(mockEpisodic.store).toHaveBeenCalledWith(
            expect.stringContaining("contingency_plan_"),
            expect.stringContaining("Market Risk Level: high"),
            expect.any(String),
            expect.arrayContaining(["market_shock", "phase_27"]),
            "test_company",
            undefined, undefined, undefined, undefined, undefined, undefined,
            "corporate_strategy"
        );
    });
});
