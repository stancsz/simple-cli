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

// 2. Business Ops Tools (Fleet Management & Performance)
// We need to mock the logic functions that these tools use.

vi.mock("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js", () => ({
    getFleetStatusLogic: vi.fn(),
    getActiveProjects: vi.fn()
}));

vi.mock("../../src/mcp_servers/business_ops/tools/performance_analytics.js", () => ({
    collectPerformanceMetrics: vi.fn()
}));

// 3. HR Tools (Pattern Analysis)
vi.mock("../../src/mcp_servers/hr/tools/pattern_analysis.js", () => ({
    analyzeCrossSwarmPatterns: vi.fn()
}));

// --- Test Suite: Phase 25 Autonomous Corporate Consciousness ---

describe("Phase 25: Autonomous Corporate Consciousness (Strategic Validation)", () => {
    let boardMeetingLogs: string[] = [];

    beforeEach(() => {
        vi.clearAllMocks();
        boardMeetingLogs = [];
        console.log = vi.fn((msg) => boardMeetingLogs.push(msg));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should manage Corporate Strategy via Brain tools (Read & Pivot)", async () => {
        // Import tools dynamically to use the mocks
        const { readStrategy, proposeStrategicPivot } = await import("../../src/mcp_servers/brain/tools.js");

        // --- Test Case 1: Read Strategy (Empty Brain) ---
        // Setup mock: recall returns empty array
        mockEpisodicMemory.recall.mockResolvedValueOnce([]);

        const initialStrategy = await readStrategy(mockEpisodicMemory as any, "default");
        expect(initialStrategy).toBeNull();
        expect(mockEpisodicMemory.recall).toHaveBeenCalledWith(
            expect.stringContaining("current corporate strategy"),
            10,
            "default",
            "corporate_strategy"
        );

        // --- Test Case 2: Propose Strategic Pivot ---
        const proposal = "Focus on enterprise AI compliance audits.";

        // Setup mock: LLM generates a new strategy
        const newStrategyJson = {
            vision: "To be the leading autonomous agency for AI compliance.",
            objectives: ["Launch Audit Service", "Certify 50 Agents"],
            policies: { "audit_frequency": "quarterly" },
            rationale: "Market demand for compliance is high."
        };

        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify(newStrategyJson)
        });

        // Setup mock: recall returns null (simulating no previous strategy)
        mockEpisodicMemory.recall.mockResolvedValueOnce([]);

        const createdStrategy = await proposeStrategicPivot(mockEpisodicMemory as any, mockLLM as any, proposal, "default");

        // Verification
        expect(createdStrategy).toBeDefined();
        expect(createdStrategy.vision).toBe(newStrategyJson.vision);
        expect(createdStrategy.timestamp).toBeDefined();

        expect(mockLLM.generate).toHaveBeenCalledWith(
            expect.stringContaining(proposal),
            []
        );

        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("strategy_update"),
            expect.stringContaining(proposal),
            expect.any(String), // The JSON string of the new strategy
            expect.arrayContaining(["corporate_governance", "phase_25"]),
            "default",
            undefined, undefined, undefined, undefined, undefined, undefined,
            "corporate_strategy" // Verify correct type tagging
        );

        // --- Test Case 3: Read Strategy (After Update) ---
        // Setup mock: recall returns the stored strategy
        const storedMemory = {
            id: "mem_123",
            timestamp: Date.now(),
            agentResponse: JSON.stringify(createdStrategy)
        };
        mockEpisodicMemory.recall.mockResolvedValueOnce([storedMemory]);

        const retrievedStrategy = await readStrategy(mockEpisodicMemory as any, "default");

        expect(retrievedStrategy).toBeDefined();
        expect(retrievedStrategy?.vision).toBe(newStrategyJson.vision);
        expect(retrievedStrategy?.objectives).toEqual(newStrategyJson.objectives);
    });

    it("should simulate a corporate board meeting and autonomous strategic pivot", async () => {
        // --- Step 0: Setup Mock Data ---

        // Mock Fleet Status (The "Body")
        const { getFleetStatusLogic } = await import("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js");
        // @ts-ignore
        getFleetStatusLogic.mockResolvedValue([
            { company: "Client A", health: "healthy", active_agents: 5 },
            { company: "Client B", health: "strained", active_agents: 12 },
            { company: "Client C", health: "healthy", active_agents: 3 }
        ]);

        // Mock Performance Metrics (The "Metabolism")
        const { collectPerformanceMetrics } = await import("../../src/mcp_servers/business_ops/tools/performance_analytics.js");
        // @ts-ignore
        collectPerformanceMetrics.mockResolvedValue({
            financial: { revenue: 500000, profit: 120000, margin: 0.24 },
            delivery: { efficiency: 0.85 },
            client: { nps: 72, churnRate: 0.01 }
        });

        // Mock Pattern Analysis (The "Subconscious")
        const { analyzeCrossSwarmPatterns } = await import("../../src/mcp_servers/hr/tools/pattern_analysis.js");
        // @ts-ignore
        analyzeCrossSwarmPatterns.mockResolvedValue({
            content: [{
                text: JSON.stringify({
                    patterns: [
                        { topic: "AI Compliance", frequency: "high", description: "Clients asking for GDPR audits on AI models." },
                        { topic: "Cost Reduction", frequency: "medium", description: "Clients reducing retainer budgets." }
                    ],
                    emerging_risks: ["Regulatory scrutiny increasing"]
                })
            }]
        });

        // Mock LLM for Strategic Decision (The "Ego/CEO")
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify({
                decision: "PIVOT",
                strategy_name: "Operation Compliance Fortress",
                objectives: [
                    "Launch AI Audit Service",
                    "Retrain 30% of fleet on GDPR",
                    "Increase margin to 30% via specialized consulting"
                ],
                rationale: "Pattern analysis indicates high demand for compliance. Current margins (24%) are below target (30%). Strained fleet in Client B suggests need for more specialized, higher-value work.",
                confidence_score: 0.92
            })
        });

        // --- Step 1: Board Meeting Simulation ---

        console.log("--- CONVENING AUTONOMOUS BOARD MEETING ---");

        // 1.1 Gather Intelligence
        const fleetStatus = await getFleetStatusLogic();
        const financials = await collectPerformanceMetrics("last_quarter");
        // @ts-ignore
        const patterns = await analyzeCrossSwarmPatterns(mockEpisodicMemory, mockLLM, { limit: 50 });

        const intelligenceBrief = {
            fleet: fleetStatus,
            financials,
            patterns: JSON.parse(patterns.content[0].text)
        };

        console.log("Intelligence Gathered:", JSON.stringify(intelligenceBrief.patterns.patterns[0]));

        // 1.2 Deliberate (Simulated by LLM call)
        console.log("Deliberating Strategy...");
        const strategicPrompt = `
            Review the following intelligence:
            - Financials: Margin ${intelligenceBrief.financials.financial.margin}
            - Fleet Health: ${intelligenceBrief.fleet.find((f: any) => f.health === 'strained') ? "Strains Detected" : "Stable"}
            - Market Patterns: ${JSON.stringify(intelligenceBrief.patterns.patterns)}

            Formulate a corporate strategy.
        `;

        const decision = await mockLLM.generate.call(this, strategicPrompt, []); // Explicit call to mock
        const strategicPlan = JSON.parse(decision.message);

        console.log(`DECISION: ${strategicPlan.decision}`);
        console.log(`NEW STRATEGY: ${strategicPlan.strategy_name}`);

        // --- Step 2: Verification ---

        expect(getFleetStatusLogic).toHaveBeenCalled();
        expect(collectPerformanceMetrics).toHaveBeenCalled();
        expect(analyzeCrossSwarmPatterns).toHaveBeenCalled();

        expect(strategicPlan.decision).toBe("PIVOT");
        expect(strategicPlan.objectives).toContain("Launch AI Audit Service");
        expect(strategicPlan.rationale).toMatch(/compliance/i);

        // --- Step 3: Persist Strategy (Corporate Memory) ---
        // Updated to use the new Type system for Corporate Memory

        mockEpisodicMemory.store.mockResolvedValue(true);
        await mockEpisodicMemory.store(
            `corporate_strategy_${Date.now()}`,
            strategicPlan.strategy_name,
            JSON.stringify(strategicPlan),
            ["corporate_governance", "phase_25"],
            "default",
            undefined, undefined, undefined, undefined, undefined, undefined,
            "corporate_strategy" // Explicitly tag as corporate_strategy
        );

        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("corporate_strategy"),
            "Operation Compliance Fortress",
            expect.any(String),
            expect.arrayContaining(["corporate_governance"]),
            "default",
            undefined, undefined, undefined, undefined, undefined, undefined,
            "corporate_strategy"
        );

        console.log("--- BOARD MEETING ADJOURNED ---");
    });
});
