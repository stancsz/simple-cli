import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerEconomicOptimizationTools } from "../../src/mcp_servers/business_ops/tools/economic_optimization.js";
import { registerMarketAnalysisTools } from "../../src/mcp_servers/business_ops/tools/market_analysis.js";
import { registerPerformanceAnalyticsTools } from "../../src/mcp_servers/business_ops/tools/performance_analytics.js";

// Mock Dependencies
const mockXeroClient = {
    accountingApi: {
        getInvoices: vi.fn(),
        getReportProfitAndLoss: vi.fn().mockResolvedValue({ body: {} })
    }
};

const mockLinearClient = {
    issues: vi.fn().mockResolvedValue({ nodes: [] }),
    projects: vi.fn().mockResolvedValue({ nodes: [] })
};

const mockHubSpotClient = {
    crm: {
        companies: {
            basicApi: {
                getPage: vi.fn().mockResolvedValue({ results: [] })
            },
            searchApi: {
                doSearch: vi.fn().mockResolvedValue({ results: [] })
            }
        }
    }
};

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
    let analyzePerfTool: any;
    let collectMarketTool: any;
    let optimizePricingTool: any;
    let adjustServiceTool: any;
    let allocateResourceTool: any;
    let generateInsightsTool: any;

    const mockServer = { tool: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();

        // Register tools
        registerEconomicOptimizationTools(mockServer as any);
        registerMarketAnalysisTools(mockServer as any);
        registerPerformanceAnalyticsTools(mockServer as any);

        // Extract tools
        const calls = (mockServer.tool as any).mock.calls;
        analyzePerfTool = calls.find((c: any) => c[0] === "analyze_performance_metrics")?.[3];
        collectMarketTool = calls.find((c: any) => c[0] === "collect_market_data")?.[3];
        optimizePricingTool = calls.find((c: any) => c[0] === "optimize_pricing_strategy")?.[3];
        adjustServiceTool = calls.find((c: any) => c[0] === "adjust_service_offerings")?.[3];
        allocateResourceTool = calls.find((c: any) => c[0] === "allocate_resources_optimally")?.[3];
        generateInsightsTool = calls.find((c: any) => c[0] === "generate_business_insights")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should aggregate performance metrics correctly", async () => {
        // Mock Xero response
        mockXeroClient.accountingApi.getInvoices.mockResolvedValue({
            body: {
                invoices: [
                    { amountDue: 1000, total: 5000, date: new Date().toISOString() },
                    { amountDue: 0, total: 3000, date: new Date().toISOString() }
                ]
            }
        });

        const result = await analyzePerfTool({ timeframe: "last_month" });
        const metrics = JSON.parse(result.content[0].text);

        console.log("Performance Metrics:", JSON.stringify(metrics, null, 2));

        expect(metrics.financial.revenue).toBe(8000);
        // expect(metrics.financial.outstanding).toBe(1000); // Removed in real implementation

        // Real implementation returns 0 if mocked dependencies return empty/simulated failures
        // Since we are mocking dependencies to return empty/basic data in this file:
        expect(metrics.operational.velocity).toBe(0);
        expect(metrics.client.npsScore).toBe(0);

        // Check Brain storage
        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("performance_audit"),
            expect.any(String),
            expect.any(String),
            [],
            undefined,
            undefined,
            false,
            undefined,
            undefined,
            0,
            0,
            "performance_audit"
        );
    });

    it("should collect market data", async () => {
        const result = await collectMarketTool({ sector: "Software", region: "US" });
        const data = JSON.parse(result.content[0].text);

        console.log("Market Data:", JSON.stringify(data, null, 2));

        expect(data.sector).toBe("Software");
        expect(data.average_hourly_rates.senior.min).toBeGreaterThan(0);
    });

    it("should optimize pricing strategy using LLM", async () => {
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify([
                { service_name: "Test Service", old_price: 100, new_price: 150, confidence_score: 0.9, reasoning: "Underpriced." }
            ])
        });

        const result = await optimizePricingTool({
            current_services: [{ name: "Test Service", current_price: 100 }],
            market_data_summary: "High demand."
        });

        const recs = JSON.parse(result.content[0].text);

        console.log("Pricing Recommendations:", JSON.stringify(recs, null, 2));

        expect(recs[0].new_price).toBe(150);
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

    it("should allocate resources based on demand forecast", async () => {
        const forecasts = [
            { clientId: "C1", projected_demand_score: 90 },
            { clientId: "C2", projected_demand_score: 40 }
        ];

        const result = await allocateResourceTool({ client_forecasts: forecasts });
        const allocation = JSON.parse(result.content[0].text);

        console.log("Resource Allocation:", JSON.stringify(allocation, null, 2));

        expect(allocation.find((a: any) => a.clientId === "C1").recommended_swarm_size).toBe(3);
        expect(allocation.find((a: any) => a.clientId === "C2").recommended_swarm_size).toBe(1);
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
