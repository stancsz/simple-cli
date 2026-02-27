import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerEconomicOptimizationTools } from "../../src/mcp_servers/business_ops/tools/economic_optimization.js";
import { registerMarketAnalysisTools } from "../../src/mcp_servers/business_ops/tools/market_analysis.js";
import { registerPricingOptimizationTools } from "../../src/mcp_servers/business_ops/tools/pricing_optimization.js";

// Mock Dependencies
const mockXeroClient = {
    accountingApi: {
        getInvoices: vi.fn()
    }
};

const mockLinearClient = {}; // Not used deeply in simulation, but good to have

const mockHubSpotClient = {};

const mockEpisodicMemory = {
    init: vi.fn(),
    store: vi.fn(),
    recall: vi.fn()
};

const mockLLM = {
    generate: vi.fn()
};

// Hoist mocks
vi.mock("../../src/mcp_servers/business_ops/xero_tools.js", () => ({
    getXeroClient: vi.fn(() => Promise.resolve(mockXeroClient)),
    getTenantId: vi.fn(() => Promise.resolve("tenant_123"))
}));

vi.mock("../../src/mcp_servers/business_ops/linear_service.js", () => ({
    getLinearClient: vi.fn(() => mockLinearClient)
}));

vi.mock("../../src/mcp_servers/business_ops/crm.js", () => ({
    getHubSpotClient: vi.fn(() => mockHubSpotClient)
}));

vi.mock("../../src/brain/episodic.js", () => ({
    EpisodicMemory: vi.fn(() => mockEpisodicMemory)
}));

vi.mock("../../src/llm.js", () => ({
    createLLM: vi.fn(() => mockLLM)
}));

describe("Economic Optimization Engine Validation", () => {
    let collectMarketTool: any;
    let optimizePricingTool: any;
    let adjustServiceTool: any;
    let generateInsightsTool: any;

    const mockServer = { tool: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();

        // Register tools
        registerEconomicOptimizationTools(mockServer as any);
        registerMarketAnalysisTools(mockServer as any);
        registerPricingOptimizationTools(mockServer as any);

        // Extract tools
        const calls = (mockServer.tool as any).mock.calls;
        collectMarketTool = calls.find((c: any) => c[0] === "collect_market_data")?.[3];
        optimizePricingTool = calls.find((c: any) => c[0] === "optimize_pricing_strategy")?.[3];
        adjustServiceTool = calls.find((c: any) => c[0] === "adjust_service_offerings")?.[3];
        generateInsightsTool = calls.find((c: any) => c[0] === "generate_business_insights")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should collect market data", async () => {
        const result = await collectMarketTool({ sector: "Software", region: "US" });
        const data = JSON.parse(result.content[0].text);

        console.log("Market Data:", JSON.stringify(data, null, 2));

        expect(data.sector).toBe("Software");
        expect(data.average_hourly_rates.senior.min).toBeGreaterThan(0);
    });

    it("should optimize pricing strategy using LLM", async () => {
        mockEpisodicMemory.recall.mockResolvedValue([]);
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify([
                { service_name: "Test Service", current_price: 100, recommended_price: 150, confidence_score: 0.9, reasoning: "Underpriced." }
            ])
        });

        const result = await optimizePricingTool({
            current_services: [{ name: "Test Service", current_price: 100 }]
        });

        const recs = JSON.parse(result.content[0].text);

        console.log("Pricing Recommendations:", JSON.stringify(recs, null, 2));

        expect(recs[0].recommended_price).toBe(150);
        expect(mockLLM.generate).toHaveBeenCalled();
    });

    it("should recommend service adjustments based on low margins", async () => {
        const lowMarginMetrics = JSON.stringify({
            financial: { margin: 0.1 },
            client: { churnRate: 0.02 },
            delivery: { efficiency: 0.8 }
        });

        const result = await adjustServiceTool({ performance_metrics: lowMarginMetrics });
        const recs = JSON.parse(result.content[0].text);

        console.log("Service Adjustments:", JSON.stringify(recs, null, 2));

        expect(recs[0].action).toBe("Bundle Services");
    });

    it("should generate executive insights", async () => {
        mockLLM.generate.mockResolvedValue({
            message: "# Executive Summary\nAll systems nominal."
        });

        const result = await generateInsightsTool({
            metrics: "{}",
            market_analysis: "Good",
            pricing_recommendations: "[]"
        });

        console.log("Executive Insights:", result.content[0].text);

        expect(result.content[0].text).toContain("# Executive Summary");
    });
});
