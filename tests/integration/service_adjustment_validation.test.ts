import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerServiceAdjustmentTools } from "../../src/mcp_servers/business_ops/tools/service_adjustment.js";

// Mock Dependencies
const mockCollectPerformanceMetrics = vi.fn();
const mockCollectMarketData = vi.fn();

const mockLLM = {
    generate: vi.fn()
};

// Hoist mocks
vi.mock("../../src/mcp_servers/business_ops/tools/performance_analytics.js", () => ({
    collectPerformanceMetrics: vi.fn((...args) => mockCollectPerformanceMetrics(...args))
}));

vi.mock("../../src/mcp_servers/business_ops/tools/market_analysis.js", () => ({
    collectMarketData: vi.fn((...args) => mockCollectMarketData(...args))
}));

vi.mock("../../src/llm.js", () => ({
    createLLM: vi.fn(() => mockLLM)
}));

describe("Service Adjustment Validation", () => {
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

    it("should generate valid recommendations based on input data", async () => {
        // 1. Mock Performance Data
        mockCollectPerformanceMetrics.mockResolvedValue({
            period: "last_quarter",
            financial: { revenue: 100000, margin: 0.3 },
            delivery: { efficiency: 0.8 },
            client: { satisfactionScore: 90 }
        });

        // 2. Mock Market Data
        mockCollectMarketData.mockResolvedValue({
            sector: "Software Development",
            trends: ["High demand for AI security"],
            average_hourly_rates: { senior: { min: 150, max: 200 } }
        });

        // 3. Mock LLM Response
        const mockRecommendation = {
            recommendations: [
                {
                    name: "AI Security Audit",
                    description: "Comprehensive AI vulnerability scan.",
                    target_client: "Fintech",
                    projected_margin: 0.5,
                    implementation_steps: ["Step 1", "Step 2"]
                }
            ],
            summary: "Strong opportunity in AI security."
        };
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(mockRecommendation)
        });

        // Execute Tool
        const result = await adjustServiceTool({ timeframe: "last_quarter", target_margin: 0.45 });
        const output = JSON.parse(result.content[0].text);

        // Assertions
        expect(mockCollectPerformanceMetrics).toHaveBeenCalledWith("last_quarter");
        expect(mockCollectMarketData).toHaveBeenCalledWith("Software Development", "Global", expect.any(String));
        expect(output.recommendations).toHaveLength(1);
        expect(output.recommendations[0].name).toBe("AI Security Audit");
        expect(output.recommendations[0].projected_margin).toBe(0.5);
    });

    it("should handle LLM failure gracefully with fallback", async () => {
        // Mock valid data fetch but LLM failure
        mockCollectPerformanceMetrics.mockResolvedValue({});
        mockCollectMarketData.mockResolvedValue({});
        mockLLM.generate.mockRejectedValue(new Error("LLM API Error"));

        const result = await adjustServiceTool({ timeframe: "last_quarter" });
        const output = JSON.parse(result.content[0].text);

        expect(output.recommendations).toHaveLength(1);
        expect(output.recommendations[0].name).toBe("Performance Audit Bundle"); // Fallback
        expect(output.summary).toContain("LLM analysis failed");
    });
});
