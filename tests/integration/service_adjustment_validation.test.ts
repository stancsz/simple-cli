import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerServiceAdjustmentTools } from "../../src/mcp_servers/business_ops/tools/service_adjustment.js";

// Mock Dependencies
const mockEpisodicMemory = {
    init: vi.fn(),
    store: vi.fn(),
    recall: vi.fn()
};

const mockLLM = {
    generate: vi.fn()
};

// Mock Helper Functions directly
vi.mock("../../src/mcp_servers/business_ops/tools/performance_analytics.js", () => ({
    collectPerformanceMetrics: vi.fn().mockResolvedValue({
        financial: { margin: 0.25 },
        delivery: { efficiency: 0.85 },
        client: { churnRate: 0.03 }
    })
}));

vi.mock("../../src/mcp_servers/business_ops/tools/market_analysis.js", () => ({
    getMarketData: vi.fn().mockResolvedValue({
        sector: "Software",
        demand_score: 85
    })
}));

vi.mock("../../src/brain/episodic.js", () => ({
    EpisodicMemory: vi.fn(() => mockEpisodicMemory)
}));

vi.mock("../../src/llm.js", () => ({
    createLLM: vi.fn(() => mockLLM)
}));

describe("Service Adjustment Tool Validation", () => {
    let adjustServiceTool: any;
    const mockServer = { tool: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        registerServiceAdjustmentTools(mockServer as any);
        const calls = (mockServer.tool as any).mock.calls;
        adjustServiceTool = calls.find((c: any) => c[0] === "adjust_service_offerings")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should generate service recommendations using LLM", async () => {
        // Mock Brain Recall
        mockEpisodicMemory.recall.mockResolvedValue([
            { content: { type: "Project A", success: true } }
        ]);

        // Mock LLM Response
        const mockRecommendations = [
            {
                bundle_name: "AI Optimization",
                description: "Optimize workflows using AI.",
                target_client_profile: "Tech Startups",
                recommended_price: 10000,
                price_justification: "High ROI.",
                expected_margin: 0.5,
                confidence_score: 0.8
            }
        ];

        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(mockRecommendations)
        });

        const result = await adjustServiceTool({ analysis_period: "last_quarter" });
        const recommendations = JSON.parse(result.content[0].text);

        console.log("Service Recommendations:", JSON.stringify(recommendations, null, 2));

        expect(recommendations).toHaveLength(1);
        expect(recommendations[0].bundle_name).toBe("AI Optimization");
        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("service_adjustment"),
            expect.any(String),
            expect.any(String),
            expect.arrayContaining(["economic_optimization"]),
            undefined, undefined, false, undefined, undefined, 0, 0,
            "service_recommendation"
        );
    });

    it("should handle LLM failure with fallback", async () => {
        mockLLM.generate.mockRejectedValue(new Error("LLM Error"));

        const result = await adjustServiceTool({ analysis_period: "last_quarter" });
        const recommendations = JSON.parse(result.content[0].text);

        console.log("Fallback Recommendations:", JSON.stringify(recommendations, null, 2));

        expect(recommendations[0].bundle_name).toBe("Efficiency Audit & Optimization");
        expect(recommendations[0].confidence_score).toBe(0.5);
    });
});
