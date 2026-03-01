import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks Setup ---

// 1. Core Modules
const mockLLM = {
    generate: vi.fn(),
    embed: vi.fn().mockResolvedValue([])
};

const mockEpisodicMemory = {
    init: vi.fn(),
    store: vi.fn(),
    recall: vi.fn()
};

vi.mock("../../src/llm.js", () => ({
    createLLM: vi.fn(() => mockLLM)
}));

vi.mock("../../src/brain/episodic.js", () => ({
    EpisodicMemory: vi.fn(() => mockEpisodicMemory)
}));

// Mock `monitorMarketSignals` inside `market_shock.ts` to simulate a specific market scenario
// Since we are mocking the module, we need to handle the exports we intend to test
// Actually, it's better to NOT mock `market_shock.ts` entirely. We want to test its logic.
// We will mock `monitorMarketSignals` specifically, but we can't easily do that without `vi.mock` replacing the whole module.
// Instead, we will `vi.spyOn` or use `vi.mock` but provide actual implementations for the functions we want to test.
// Wait, `monitorMarketSignals` returns random data. To test predictably, we MUST mock it.
// We can mock `market_shock.ts` but keep the real implementation for the other functions.
// Or we can just import the real module and `vi.spyOn` it? Let's try `vi.mock` with `importOriginal`.

vi.mock("../../src/mcp_servers/brain/tools/market_shock.js", async (importOriginal) => {
    const actual = await importOriginal() as typeof import("../../src/mcp_servers/brain/tools/market_shock.js");
    return {
        ...actual,
        monitorMarketSignals: vi.fn()
    };
});


describe("Phase 27: Market Shock Absorption Validation", () => {
    let boardMeetingLogs: string[] = [];

    beforeEach(() => {
        vi.clearAllMocks();
        boardMeetingLogs = [];
        console.log = vi.fn((msg) => boardMeetingLogs.push(msg));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should detect a market downturn, evaluate risk as high, and trigger contingency plan", async () => {
        // --- Step 1: Import modules ---
        const {
            monitorMarketSignals,
            evaluateEconomicRisk,
            triggerContingencyPlan
        } = await import("../../src/mcp_servers/brain/tools/market_shock.js");
        const { applyPolicyToFleet } = await import("../../src/swarm/fleet_manager.js");

        // --- Step 2: Mock Market Signals (Downturn) ---
        // Mock a severe downturn in the tech sector, and an opportunity in AI regulation
        const mockSignals = {
            sectors: {
                "tech": { performance: -15.5, volatility: 8.5 }, // High downturn
                "ai_regulation": { performance: 20.0, volatility: 2.0 } // Sudden opportunity
            },
            macro: {
                interest_rate_trend: "rising" as const,
                inflation_trend: "rising" as const,
                consumer_confidence: 45 // Low confidence
            },
            timestamp: Date.now()
        };

        // Cast the mocked function to a mock type and provide mock return value
        (monitorMarketSignals as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockSignals);

        const currentStrategy = {
            vision: "To be the leading autonomous agency for tech companies.",
            objectives: ["Expand tech market share", "Launch AI tools"],
            policies: { "max_agents_per_swarm": 20, "pricing_tier": "premium" },
            timestamp: Date.now()
        };

        // --- Step 3: Mock LLM Responses ---

        // Mock LLM for evaluateEconomicRisk
        const mockRiskAssessment = {
            risk_level: "high",
            vulnerability_score: 85,
            rationale: "High exposure to the heavily impacted tech sector and rising interest rates."
        };
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify(mockRiskAssessment)
        });

        // Mock LLM for triggerContingencyPlan
        const mockContingencyStrategy = {
            vision: currentStrategy.vision,
            objectives: ["Survive the tech downturn", "Pivot to AI regulation opportunities", ...currentStrategy.objectives],
            policies: {
                "max_agents_per_swarm": 5, // Aggressive contingency
                "pricing_tier": "conservative",
                "pause_non_critical_swarms": true
            },
            rationale: "Implementing aggressive defensive posture due to tech sector shock."
        };
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify(mockContingencyStrategy)
        });


        // --- Step 4: Execution ---
        const capturedSignals = await monitorMarketSignals();
        expect(capturedSignals.sectors["tech"].performance).toBe(-15.5);

        const riskAssessment = await evaluateEconomicRisk(capturedSignals, currentStrategy, mockLLM as any);
        expect(riskAssessment.risk_level).toBe("high");
        expect(riskAssessment.vulnerability_score).toBe(85);

        const newStrategy = await triggerContingencyPlan(riskAssessment, currentStrategy, mockEpisodicMemory as any, mockLLM as any, "TestCorp");

        // --- Step 5: Verification ---
        // Verify Contingency Strategy
        expect(newStrategy.policies["pause_non_critical_swarms"]).toBe(true);
        expect(newStrategy.policies["max_agents_per_swarm"]).toBe(5);

        // Verify Memory Storage
        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("contingency_plan_"),
            expect.stringContaining("Market Risk Level: high"),
            expect.stringContaining("pause_non_critical_swarms"),
            expect.arrayContaining(["corporate_governance", "market_shock", "phase_27"]),
            "TestCorp",
            undefined, undefined, undefined, undefined, undefined, undefined,
            "corporate_strategy"
        );

        // --- Step 6: Policy Propagation to Fleet Status ---
        const mockFleetStatus = {
            company: "TestCorp",
            projectId: "p1",
            active_agents: 10, // Exceeds new contingency limit of 5
            pending_issues: 5,
            health: "healthy",
            last_updated: new Date()
        };

        const policyObj = {
            id: "pol_contingency",
            version: 2,
            name: "Market Shock Response",
            parameters: newStrategy.policies, // Uses the modified policies
            isActive: true,
            timestamp: Date.now()
        };

        const complianceResult = applyPolicyToFleet(mockFleetStatus, policyObj);

        // Verify Compliance Check
        expect(complianceResult.compliance_status).toBe("violation");
        expect(complianceResult.violations![0]).toContain("exceeds max (5)");
    });
});
