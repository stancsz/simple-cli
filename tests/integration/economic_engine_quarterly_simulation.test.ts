import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerMarketAnalysisTools } from "../../src/mcp_servers/business_ops/tools/market_analysis.js";
import { registerPerformanceAnalyticsTools } from "../../src/mcp_servers/business_ops/tools/performance_analytics.js";
import { registerPricingOptimizationTools } from "../../src/mcp_servers/business_ops/tools/pricing_optimization.js";
import { registerServiceAdjustmentTools } from "../../src/mcp_servers/business_ops/tools/service_adjustment.js";
import { registerResourceAllocationTools } from "../../src/mcp_servers/business_ops/tools/resource_allocation.js";

// --- Mocks Setup ---

// 1. External APIs (Xero, Linear, HubSpot)
const mockXeroClient = {
    accountingApi: {
        getInvoices: vi.fn()
    }
};

const mockLinearClient = {
    issues: vi.fn()
};

const mockHubSpotClient = {
    crm: {
        deals: {
            searchApi: {
                doSearch: vi.fn()
            }
        }
    }
};

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

// 2. Internal Core (LLM, Brain)
const mockLLM = {
    generate: vi.fn()
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

// 3. Other Tools/Modules
vi.mock("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js", () => ({
    getFleetStatusLogic: vi.fn()
}));

vi.mock("../../src/mcp_servers/scaling_engine/scaling_orchestrator.js", () => ({
    scaleSwarmLogic: vi.fn()
}));

// 4. Global Fetch (for Market Analysis)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// --- Test Suite ---

describe("Economic Engine: Quarterly Simulation (Phase 24 Validation)", () => {
    let server: McpServer;
    let registeredTools: Record<string, any> = {};

    beforeEach(() => {
        vi.clearAllMocks();
        registeredTools = {};

        // Mock Server that captures tools
        server = {
            tool: (name: string, description: string, schema: any, handler: any) => {
                registeredTools[name] = handler;
            }
        } as unknown as McpServer;

        // Register all tools
        registerMarketAnalysisTools(server);
        registerPerformanceAnalyticsTools(server);
        registerPricingOptimizationTools(server);
        registerServiceAdjustmentTools(server);
        registerResourceAllocationTools(server);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should execute the full optimization cycle successfully", async () => {
        console.log("Starting Quarterly Economic Optimization Simulation...");

        // --- Step 1: Market Data Collection ---
        console.log("Step 1: Collecting Market Data...");

        // Mock LLM for Market Analysis
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify({
                trends: ["AI Automation", "Cost Efficiency"],
                opportunities: ["Enterprise Audits"],
                market_growth_rate: "12%"
            })
        });

        const marketData = await registeredTools["collect_market_data"]({
            sector: "Software Development",
            region: "US"
        });

        const marketContent = JSON.parse(marketData.content[0].text);
        expect(marketContent.sector).toBe("Software Development");
        expect(marketContent.trends).toContain("AI Automation");
        console.log("✅ Market Data Collected:", marketContent.market_growth_rate);


        // --- Step 2: Performance Analytics ---
        console.log("Step 2: Analyzing Performance Metrics...");

        // Mock Xero (Revenue)
        mockXeroClient.accountingApi.getInvoices.mockResolvedValue({
            body: {
                invoices: [
                    { total: 100000, amountDue: 5000, status: "PAID" },
                    { total: 50000, amountDue: 0, status: "PAID" }
                ]
            }
        });

        // Mock Linear (Efficiency)
        mockLinearClient.issues.mockResolvedValue({
            nodes: [
                { state: Promise.resolve({ type: "completed" }), completedAt: new Date(), createdAt: new Date(Date.now() - 86400000) },
                { state: Promise.resolve({ type: "completed" }), completedAt: new Date(), createdAt: new Date(Date.now() - 172800000) },
                { state: Promise.resolve({ type: "started" }) }
            ]
        });

        // Mock HubSpot (Clients)
        mockHubSpotClient.crm.deals.searchApi.doSearch.mockResolvedValue({
            results: new Array(15).fill({ id: "deal_x" })
        });

        const perfMetrics = await registeredTools["analyze_performance_metrics"]({
            timeframe: "last_quarter"
        });

        const metricsContent = JSON.parse(perfMetrics.content[0].text);
        expect(metricsContent.financial.revenue).toBe(150000);
        expect(metricsContent.delivery.efficiency).toBeGreaterThan(0.6);
        console.log("✅ Performance Analyzed: Revenue =", metricsContent.financial.revenue);


        // --- Step 3: Optimize Pricing ---
        console.log("Step 3: Optimizing Pricing Strategy...");

        // Mock Memory for Pricing (No recent run)
        mockEpisodicMemory.recall.mockResolvedValue([]);

        // Mock LLM for Pricing
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify([
                {
                    service_name: "Consulting",
                    current_price: 200,
                    recommended_price: 250,
                    confidence_score: 0.85,
                    reasoning: "High demand observed in market analysis."
                }
            ])
        });

        const pricingRecs = await registeredTools["optimize_pricing_strategy"]({
            current_services: [{ name: "Consulting", current_price: 200 }]
        });

        const pricingContent = JSON.parse(pricingRecs.content[0].text);
        expect(pricingContent[0].recommended_price).toBe(250);
        console.log("✅ Pricing Optimized: Increase recommended to", pricingContent[0].recommended_price);


        // --- Step 4: Adjust Service Offerings ---
        console.log("Step 4: Adjusting Service Offerings...");

        // Mock Memory for Success Patterns
        mockEpisodicMemory.recall.mockResolvedValueOnce([
            { userPrompt: "Build App", agentResponse: "Done", dreaming_outcomes: "Success" }
        ]);

        // Mock LLM for Service Adjustment
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify([
                {
                    bundle_name: "AI Audit Pack",
                    description: "Quick turnaround audit",
                    target_client_profile: "Enterprise",
                    recommended_price: 5000,
                    expected_margin: 0.5,
                    confidence_score: 0.9
                }
            ])
        });

        const serviceRecs = await registeredTools["adjust_service_offerings"]({
            analysis_period: "last_quarter"
        });

        const serviceContent = JSON.parse(serviceRecs.content[0].text);
        expect(serviceContent[0].bundle_name).toBe("AI Audit Pack");
        console.log("✅ Services Adjusted: New bundle proposed -", serviceContent[0].bundle_name);


        // --- Step 5: Allocate Resources ---
        console.log("Step 5: Allocating Resources Optimally...");

        // Mock Fleet Status
        const { getFleetStatusLogic } = await import("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js");
        // @ts-ignore
        getFleetStatusLogic.mockResolvedValue([
            { projectId: "proj_1", company: "Acme Corp", status: "active" }
        ]);

        // Mock LLM for Resource Allocation
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify({
                recommendation: "scale_up",
                reasoning: "High demand predicted.",
                confidence_score: 85
            })
        });

        const allocationRecs = await registeredTools["allocate_resources_optimally"]({
            dry_run: true
        });

        const allocationContent = JSON.parse(allocationRecs.content[0].text);
        expect(allocationContent.recommendations[0].recommendation).toBe("scale_up");
        console.log("✅ Resources Allocated: Recommendation -", allocationContent.recommendations[0].recommendation);

        console.log("Quarterly Simulation Completed Successfully.");
    });
});
