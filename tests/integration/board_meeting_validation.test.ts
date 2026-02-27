import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// --- Mocks Setup ---

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

// Mock Business Ops Logic
vi.mock("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js", () => ({
    getFleetStatusLogic: vi.fn()
}));

vi.mock("../../src/mcp_servers/business_ops/tools/performance_analytics.js", () => ({
    collectPerformanceMetrics: vi.fn()
}));

vi.mock("../../src/mcp_servers/business_ops/tools/policy_engine.js", () => ({
    updateOperatingPolicyLogic: vi.fn()
}));

// Mock Brain Logic (Internal imports)
// Since `board_meeting.ts` imports these, we need to mock the modules where they come from.
vi.mock("../../src/mcp_servers/brain/tools/strategy.js", () => ({
    readStrategy: vi.fn()
}));

vi.mock("../../src/mcp_servers/brain/tools/scan_strategic_horizon.js", () => ({
    scanStrategicHorizon: vi.fn()
}));


describe("Autonomous Board Meeting Workflow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should successfully convene a board meeting and mandate a strategic pivot", async () => {
        // 1. Setup Mocks for "Intelligence Gathering"
        const { getFleetStatusLogic } = await import("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js");
        const { collectPerformanceMetrics } = await import("../../src/mcp_servers/business_ops/tools/performance_analytics.js");
        const { readStrategy } = await import("../../src/mcp_servers/brain/tools/strategy.js");
        const { scanStrategicHorizon } = await import("../../src/mcp_servers/brain/tools/scan_strategic_horizon.js");
        const { updateOperatingPolicyLogic } = await import("../../src/mcp_servers/business_ops/tools/policy_engine.js");

        // @ts-ignore
        readStrategy.mockResolvedValue({
            vision: "Old Vision",
            objectives: ["Survive"],
            policies: {},
            timestamp: Date.now()
        });

        // @ts-ignore
        scanStrategicHorizon.mockResolvedValue({
            emerging_opportunities: ["AI Compliance"],
            potential_threats: ["Competitor X"],
            strategic_recommendations: [{ action: "Pivot", priority: "high" }]
        });

        // @ts-ignore
        getFleetStatusLogic.mockResolvedValue([
            { company: "Client A", health: "strained", active_agents: 10 }
        ]);

        // @ts-ignore
        collectPerformanceMetrics.mockResolvedValue({
            financial: { revenue: 1000, profit: 50, margin: 0.05 }, // Low margin
            delivery: { efficiency: 0.7 },
            client: { nps: 40 }
        });

        // 2. Setup Mocks for Personas (LLM Responses)
        // Sequence: CFO -> CSO -> CEO
        mockLLM.generate
            .mockResolvedValueOnce({ message: "CFO: Margins are critically low (5%). Recommend cutting costs." }) // CFO
            .mockResolvedValueOnce({ message: "CSO: Market shifting to Compliance. We must pivot." }) // CSO
            .mockResolvedValueOnce({ // CEO Decision
                message: JSON.stringify({
                    decision: "STRATEGIC_PIVOT",
                    rationale: "Margins are unsustainable, and high-value compliance market is open.",
                    policy_updates: [
                        { parameter: "min_margin", value: 0.35, justification: "Force high-value deal acceptance only." },
                        { parameter: "risk_tolerance", value: "high", justification: "Aggressive growth needed." }
                    ],
                    meeting_minutes: "Board convened. CFO highlighted financial distress. CSO identified pivot. CEO mandated pivot to Compliance focus and raised margin targets."
                })
            });

        // 3. Execute
        // @ts-ignore
        const { conveneBoardMeeting } = await import("../../src/mcp_servers/brain/tools/board_meeting.js");
        const resolution = await conveneBoardMeeting(mockEpisodicMemory as any, "default");

        // 4. Verify Intelligence Gathering
        expect(readStrategy).toHaveBeenCalled();
        expect(scanStrategicHorizon).toHaveBeenCalled();
        expect(getFleetStatusLogic).toHaveBeenCalled();
        expect(collectPerformanceMetrics).toHaveBeenCalled();

        // 5. Verify LLM Persona Chain
        expect(mockLLM.generate).toHaveBeenCalledTimes(3);

        // 6. Verify Resolution Output
        expect(resolution).toBeDefined();
        expect(resolution.decision).toBe("STRATEGIC_PIVOT");
        expect(resolution.policy_updates).toHaveLength(2);
        expect(resolution.policy_updates[0].parameter).toBe("min_margin");
        expect(resolution.policy_updates[0].value).toBe(0.35);

        // 7. Verify Side Effects (Memory & Policy Engine)
        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("board_meeting"),
            expect.stringContaining("Convene Board Meeting"),
            expect.any(String), // Resolution JSON
            expect.arrayContaining(["corporate_governance"]),
            "default",
            undefined, undefined, undefined,
            expect.any(String), // ID
            0, 0,
            "board_meeting_minutes"
        );

        // Verify Policy Update was triggered
        expect(updateOperatingPolicyLogic).toHaveBeenCalledWith(expect.objectContaining({
            company: "default",
            min_margin: 0.35,
            risk_tolerance: "high",
            name: expect.stringContaining("Policy Updated via Board Resolution"),
            description: expect.stringContaining("Autonomous update")
        }));
    });

    it("should maintain strategy if performance is good", async () => {
         // Setup Mocks for "Good Performance"
         const { getFleetStatusLogic } = await import("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js");
         const { collectPerformanceMetrics } = await import("../../src/mcp_servers/business_ops/tools/performance_analytics.js");
         const { updateOperatingPolicyLogic } = await import("../../src/mcp_servers/business_ops/tools/policy_engine.js");

         // @ts-ignore
         getFleetStatusLogic.mockResolvedValue([]);
         // @ts-ignore
         collectPerformanceMetrics.mockResolvedValue({ financial: {}, delivery: {} }); // Mock irrelevant here

         mockLLM.generate
            .mockResolvedValueOnce({ message: "CFO: All good." })
            .mockResolvedValueOnce({ message: "CSO: On track." })
            .mockResolvedValueOnce({
                message: JSON.stringify({
                    decision: "MAINTAIN_STRATEGY",
                    rationale: "Steady as she goes.",
                    policy_updates: [],
                    meeting_minutes: "Meeting adjourned. No changes."
                })
            });

         // @ts-ignore
         const { conveneBoardMeeting } = await import("../../src/mcp_servers/brain/tools/board_meeting.js");
         const resolution = await conveneBoardMeeting(mockEpisodicMemory as any, "default");

         expect(resolution.decision).toBe("MAINTAIN_STRATEGY");
         expect(updateOperatingPolicyLogic).not.toHaveBeenCalled();
    });
});
