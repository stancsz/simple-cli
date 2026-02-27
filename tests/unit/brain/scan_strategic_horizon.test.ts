import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scanStrategicHorizon } from "../../../src/mcp_servers/brain/tools/scan_strategic_horizon.js";

// --- Mocks ---
const mockLLM = {
    generate: vi.fn(),
    embed: vi.fn().mockResolvedValue([])
};

const mockEpisodicMemory = {
    recall: vi.fn()
};

vi.mock("../../../src/llm.js", () => ({
    createLLM: vi.fn(() => mockLLM)
}));

// Mock the strategy tool since it's a direct dependency
vi.mock("../../../src/mcp_servers/brain/tools/strategy.js", () => ({
    readStrategy: vi.fn()
}));

// Mock pattern analysis to isolate this test
vi.mock("../../../src/mcp_servers/brain/tools/pattern_analysis.js", () => ({
    analyzePatterns: vi.fn()
}));

import { readStrategy } from "../../../src/mcp_servers/brain/tools/strategy.js";
import { analyzePatterns } from "../../../src/mcp_servers/brain/tools/pattern_analysis.js";

describe("Brain: Strategic Horizon Scanner", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should generate a structured strategic report", async () => {
        // 1. Setup Data
        const mockStrategy = {
            vision: "Be #1",
            objectives: ["Growth"],
            timestamp: Date.now()
        };

        const mockPatterns = {
            internal_patterns: ["Strong delivery"],
            external_trends: ["AI is booming"],
            synthesis: "Good alignment"
        };

        const mockReport = {
            emerging_opportunities: ["New Market X"],
            potential_threats: ["Competitor Y"],
            strategic_recommendations: [
                { action: "Invest in X", priority: "high", rationale: "First mover advantage" }
            ],
            synthesis_summary: "Lookin' good."
        };

        // 2. Setup Mocks
        // @ts-ignore
        readStrategy.mockResolvedValue(mockStrategy);
        // @ts-ignore
        analyzePatterns.mockResolvedValue(mockPatterns);

        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(mockReport)
        });

        // 3. Execute
        const report = await scanStrategicHorizon(mockEpisodicMemory as any, "default");

        // 4. Verify
        expect(readStrategy).toHaveBeenCalledWith(mockEpisodicMemory, "default");
        expect(analyzePatterns).toHaveBeenCalledWith(mockEpisodicMemory, expect.anything(), true);
        expect(mockLLM.generate).toHaveBeenCalledWith(expect.stringContaining("Strategic Horizon Report"), []);

        expect(report).toEqual(mockReport);
        expect(report.emerging_opportunities).toContain("New Market X");
    });

    it("should handle LLM parsing errors gracefully", async () => {
        // @ts-ignore
        readStrategy.mockResolvedValue(null);
        // @ts-ignore
        analyzePatterns.mockResolvedValue({});

        mockLLM.generate.mockResolvedValue({
            message: "This is not JSON."
        });

        await expect(scanStrategicHorizon(mockEpisodicMemory as any)).rejects.toThrow("Failed to generate Strategic Horizon Report");
    });
});
