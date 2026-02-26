import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerPerformanceAnalyticsTools } from "../../src/mcp_servers/business_ops/tools/performance_analytics.js";

// Mock Dependencies
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

const mockEpisodicMemory = {
    init: vi.fn(),
    store: vi.fn(),
    recall: vi.fn()
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

describe("Performance Analytics Tool Validation", () => {
    let analyzePerfTool: any;
    const mockServer = { tool: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();

        // Register tools
        registerPerformanceAnalyticsTools(mockServer as any);

        // Extract tool
        const calls = (mockServer.tool as any).mock.calls;
        analyzePerfTool = calls.find((c: any) => c[0] === "analyze_performance_metrics")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should aggregate metrics from all systems correctly", async () => {
        // Mock Xero response
        mockXeroClient.accountingApi.getInvoices.mockResolvedValue({
            body: {
                invoices: [
                    { total: 5000, amountDue: 1000 }, // Paid 4000
                    { total: 5000, amountDue: 0 }     // Paid 5000
                ]
            }
        });

        // Mock Linear response
        mockLinearClient.issues.mockResolvedValue({
            nodes: [
                {
                    state: Promise.resolve({ type: "completed" }),
                    completedAt: new Date(Date.now()),
                    createdAt: new Date(Date.now() - 86400000 * 2) // 2 days ago
                },
                {
                    state: Promise.resolve({ type: "backlog" })
                }
            ]
        });

        // Mock HubSpot response
        mockHubSpotClient.crm.deals.searchApi.doSearch.mockResolvedValue({
            results: [
                { properties: { dealstage: "closedwon" } },
                { properties: { dealstage: "closedlost" } }
            ]
        });

        const result = await analyzePerfTool({ period: "last_30_days" });
        const data = JSON.parse(result.content[0].text);

        console.log("Aggregated Metrics:", JSON.stringify(data, null, 2));

        // Validation
        expect(data.errors).toHaveLength(0);

        // Financial
        expect(data.metrics.financial.revenue).toBe(10000);
        expect(data.metrics.financial.outstanding).toBe(1000);
        expect(data.metrics.financial.profit_margin_proxy).toBe(0.9);

        // Efficiency
        expect(data.metrics.efficiency.completion_rate).toBe(0.5); // 1 completed / 2 total
        expect(data.metrics.efficiency.backlog_size).toBe(1);
        expect(data.metrics.efficiency.average_cycle_time_days).toBeCloseTo(2, 0.1);

        // Satisfaction
        expect(data.metrics.satisfaction.deal_win_rate).toBe(0.5); // 1 won / 2 closed

        // Overall Score
        // Fin: 90 * 0.4 = 36
        // Eff: 50 * 0.3 = 15
        // Sat: 50 * 0.3 = 15
        // Total: 66
        expect(data.metrics.overall_health_score).toBe(66);
    });

    it("should handle partial failures gracefully", async () => {
        // Mock Xero failure
        mockXeroClient.accountingApi.getInvoices.mockRejectedValue(new Error("Xero API Error"));

        // Mock Linear success
        mockLinearClient.issues.mockResolvedValue({ nodes: [] });

        // Mock HubSpot success
        mockHubSpotClient.crm.deals.searchApi.doSearch.mockResolvedValue({ results: [] });

        const result = await analyzePerfTool({ period: "last_30_days" });
        const data = JSON.parse(result.content[0].text);

        console.log("Partial Failure Metrics:", JSON.stringify(data, null, 2));

        expect(data.errors).toContain("Xero: Xero API Error");
        expect(data.metrics.financial.revenue).toBe(0); // Should be default
        expect(data.metrics.efficiency.completion_rate).toBe(0); // Should be processed (even if empty)
    });

    it("should store snapshot in Brain", async () => {
         // Setup successful mocks
         mockXeroClient.accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [] } });
         mockLinearClient.issues.mockResolvedValue({ nodes: [] });
         mockHubSpotClient.crm.deals.searchApi.doSearch.mockResolvedValue({ results: [] });

         await analyzePerfTool({ period: "last_30_days" });

         expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
             expect.stringContaining("performance_snapshot_last_30_days"),
             "Agency Performance Snapshot",
             expect.any(String),
             [],
             undefined,
             undefined,
             false,
             undefined,
             undefined,
             0,
             0,
             "performance_metric"
         );
    });
});
