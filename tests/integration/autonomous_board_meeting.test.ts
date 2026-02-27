import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { createLLM } from "../../src/llm.js";
import { conveneBoardMeeting } from "../../src/mcp_servers/brain/tools/convene_board_meeting.js";
import { randomUUID } from "crypto";

// Mock dependencies
vi.mock("../../src/llm.js", () => ({
    createLLM: vi.fn(),
}));

vi.mock("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js", () => ({
    getFleetStatusLogic: vi.fn(),
}));

vi.mock("../../src/mcp_servers/business_ops/tools/performance_analytics.js", () => ({
    collectPerformanceMetrics: vi.fn(),
}));

// Mock Brain internal tools
vi.mock("../../src/mcp_servers/brain/tools/scan_strategic_horizon.js", () => ({
    scanStrategicHorizon: vi.fn(),
}));

vi.mock("../../src/mcp_servers/brain/tools/strategy.js", () => ({
    readStrategy: vi.fn(),
    proposeStrategicPivot: vi.fn(), // We are not using this directly in the refactored convene, but mocking just in case
}));

// We need to allow `policy_engine.ts` to be imported, but we want to mock its exports?
// No, the requirement is to use "real calls to the Brain and Policy Engine MCPs" logic where possible,
// but since `conveneBoardMeeting` imports them, we can mock the IMPORTS used by `conveneBoardMeeting`.
// However, to test the *integration* of policy updates, we ideally want `updateOperatingPolicyLogic` to actually run
// and store to the mocked Episodic Memory.
// BUT `conveneBoardMeeting` imports `updateOperatingPolicyLogic` from `policy_engine.js`.
// If we want to verify it calls the logic, we can spy on it, or mock the side effects.
// Let's use the REAL `updateOperatingPolicyLogic` by NOT mocking `policy_engine.js` fully,
// but we need to ensure it uses our mocked EpisodicMemory.
// In `convene_board_meeting.ts`, it calls `updateOperatingPolicyLogic(episodic, ...)`.
// So if we pass our test `episodic` instance, the real logic will use it. Perfect.

import { getFleetStatusLogic } from "../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js";
import { collectPerformanceMetrics } from "../../src/mcp_servers/business_ops/tools/performance_analytics.js";
import { scanStrategicHorizon } from "../../src/mcp_servers/brain/tools/scan_strategic_horizon.js";
import { readStrategy } from "../../src/mcp_servers/brain/tools/strategy.js";

describe("Autonomous Board Meeting Integration", () => {
    let episodic: EpisodicMemory;
    let mockLLM: any;

    beforeEach(() => {
        // Setup Episodic Memory with in-memory storage (mocked via factory or just standard usage if possible)
        // Since EpisodicMemory uses LanceDB which writes to disk, we should mock `store` and `recall`.
        // Or better, we mock the `EpisodicMemory` class instance passed to the function.
        episodic = {
            recall: vi.fn().mockResolvedValue([]),
            store: vi.fn().mockResolvedValue(undefined),
        } as any;

        mockLLM = {
            generate: vi.fn(),
        };
        (createLLM as any).mockReturnValue(mockLLM);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should successfully convene a board meeting and enact a policy update", async () => {
        // 1. Setup Data Stubs
        (getFleetStatusLogic as any).mockResolvedValue([
            { company: "Acme Corp", health: "strained", active_agents: 5 }
        ]);

        (collectPerformanceMetrics as any).mockResolvedValue({
            financial: { revenue: 100000, profit: 10000, margin: 0.1 }, // Low margin!
        });

        (scanStrategicHorizon as any).mockResolvedValue({
            emerging_opportunities: ["AI in Healthcare"],
            potential_threats: ["Margin compression"],
            strategic_recommendations: [{ action: "Increase prices", priority: "high" }]
        });

        (readStrategy as any).mockResolvedValue({
            vision: "Old Vision",
            policies: { min_margin: 0.2 }
        });

        // 2. Setup LLM Response (The Board Decision)
        const mockBoardMinutes = {
            meeting_id: "test-meeting-id",
            timestamp: new Date().toISOString(),
            attendees: ["CEO", "CFO", "CSO"],
            summary: "Margins are too low. We must pivot.",
            decisions: [
                { type: "strategic_pivot", description: "Pivot to high-margin enterprise clients." },
                { type: "policy_update", description: "Increase minimum margin to 40%." }
            ],
            new_strategy: {
                vision: "High-Margin Enterprise AI",
                objectives: ["Recover profitability"],
                policies: { min_margin: 0.4 }
            },
            policy_updates: {
                min_margin: 0.4,
                risk_tolerance: "low"
            }
        };

        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(mockBoardMinutes)
        });

        // 3. Invoke the Workflow
        const result = await conveneBoardMeeting(episodic, "Acme Corp");

        // 4. Verify Workflow Execution
        expect(getFleetStatusLogic).toHaveBeenCalled();
        expect(collectPerformanceMetrics).toHaveBeenCalled();
        expect(scanStrategicHorizon).toHaveBeenCalled();

        // 5. Verify LLM Interaction
        // We check that the prompt contains the goal and the context data
        expect(mockLLM.generate).toHaveBeenCalledWith(
            expect.stringContaining("Synthesize the discussion into a final, binding **Board Resolution**"),
            expect.any(Array)
        );

        // 6. Verify Strategy Persistence
        expect(episodic.store).toHaveBeenCalledWith(
            expect.stringContaining("strategy_update"),
            expect.stringContaining("Board Meeting Decision"),
            expect.stringContaining("High-Margin Enterprise AI"),
            expect.any(Array),
            "Acme Corp",
            undefined, undefined, undefined, undefined, 0, 0, "corporate_strategy"
        );

        // 7. Verify Policy Update Persistence
        // The real `updateOperatingPolicyLogic` calls `episodic.store`.
        // We expect a call with type "corporate_policy".
        expect(episodic.store).toHaveBeenCalledWith(
            expect.stringContaining("policy_update_v"), // Version 1 (since recall returned empty)
            expect.stringContaining("Board Update: min_margin: 0.4, risk_tolerance: low"),
            expect.stringContaining('"min_margin":0.4'), // Check JSON content
            expect.any(Array),
            "Acme Corp",
            undefined, undefined, undefined, expect.any(String), 0, 0, "corporate_policy"
        );

        // 8. Verify Minutes Persistence
        expect(episodic.store).toHaveBeenCalledWith(
            `board_meeting_${mockBoardMinutes.meeting_id}`,
            expect.stringContaining("Autonomous Board Meeting"),
            expect.stringContaining("High-Margin Enterprise AI"),
            expect.any(Array),
            "Acme Corp",
            undefined, undefined, undefined, mockBoardMinutes.meeting_id, 0, 0, "board_meeting_minutes"
        );

        // Check Result Return
        expect(result).toEqual(mockBoardMinutes);
    });

    it("should handle cases where no changes are recommended", async () => {
         // 1. Setup Data Stubs (Healthy)
         (getFleetStatusLogic as any).mockResolvedValue([]);
         (collectPerformanceMetrics as any).mockResolvedValue({ financial: { margin: 0.5 } });
         (scanStrategicHorizon as any).mockResolvedValue({});
         (readStrategy as any).mockResolvedValue(null);

         // 2. Setup LLM Response (Maintain Course)
         const mockBoardMinutes = {
             meeting_id: "test-meeting-id-2",
             timestamp: new Date().toISOString(),
             attendees: ["CEO", "CFO", "CSO"],
             summary: "Everything looks good.",
             decisions: [
                 { type: "maintain_course", description: "Continue current strategy." }
             ]
             // No new_strategy or policy_updates
         };

         mockLLM.generate.mockResolvedValue({
             message: JSON.stringify(mockBoardMinutes)
         });

         // 3. Invoke
         const result = await conveneBoardMeeting(episodic, "Acme Corp");

         // 4. Verify
         // Should NOT store strategy update
         expect(episodic.store).not.toHaveBeenCalledWith(
             expect.stringContaining("strategy_update"),
             expect.any(String), expect.any(String), expect.any(Array), expect.any(String), undefined, undefined, undefined, undefined, 0, 0, "corporate_strategy"
         );

         // Should NOT store policy update
         expect(episodic.store).not.toHaveBeenCalledWith(
             expect.stringContaining("policy_update"),
             expect.any(String), expect.any(String), expect.any(Array), expect.any(String), undefined, undefined, undefined, expect.any(String), 0, 0, "corporate_policy"
         );

         // Should store minutes
         expect(episodic.store).toHaveBeenCalledWith(
             `board_meeting_${mockBoardMinutes.meeting_id}`,
             expect.any(String),
             expect.any(String),
             expect.any(Array),
             "Acme Corp",
             undefined, undefined, undefined, mockBoardMinutes.meeting_id, 0, 0, "board_meeting_minutes"
         );
    });
});
