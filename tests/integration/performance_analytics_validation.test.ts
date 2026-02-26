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

describe("Performance Analytics Validation", () => {
    let analyzePerfTool: any;
    const mockServer = { tool: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        registerPerformanceAnalyticsTools(mockServer as any);
        const calls = (mockServer.tool as any).mock.calls;
        analyzePerfTool = calls.find((c: any) => c[0] === "analyze_performance_metrics")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should calculate metrics correctly with full data", async () => {
        // 1. Mock Xero (Revenue = 5000, Outstanding = 1000)
        mockXeroClient.accountingApi.getInvoices.mockResolvedValue({
            body: {
                invoices: [
                    { total: 3000, amountDue: 0, status: "PAID" },
                    { total: 2000, amountDue: 1000, status: "AUTHORISED" }
                ]
            }
        });

        // 2. Mock Linear (3 Issues: 2 Completed, 1 Open)
        // Cycle time: Issue 1 (2 days), Issue 2 (4 days) -> Avg 3 days
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
        const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

        mockLinearClient.issues.mockResolvedValue({
            nodes: [
                {
                    state: Promise.resolve({ type: "completed" }),
                    createdAt: twoDaysAgo,
                    completedAt: now
                },
                {
                    state: Promise.resolve({ type: "completed" }),
                    createdAt: fourDaysAgo,
                    completedAt: now
                },
                {
                    state: Promise.resolve({ type: "started" })
                }
            ]
        });

        // 3. Mock HubSpot (Active Clients = 8)
        mockHubSpotClient.crm.deals.searchApi.doSearch.mockResolvedValue({
            results: new Array(8).fill({})
        });

        const result = await analyzePerfTool({ timeframe: "last_30_days" });
        const metrics = JSON.parse(result.content[0].text);

        console.log("Calculated Metrics:", JSON.stringify(metrics, null, 2));

        // Assertions
        expect(metrics.financial.revenue).toBe(5000);
        expect(metrics.financial.outstanding).toBe(1000);
        expect(metrics.financial.profit).toBe(1500); // 30% of 5000

        expect(metrics.delivery.velocity).toBe(2);
        expect(metrics.delivery.openIssues).toBe(1);
        expect(metrics.delivery.cycleTime).toBeCloseTo(3, 1);
        expect(metrics.delivery.efficiency).toBeCloseTo(0.67, 2); // 2 / 3

        expect(metrics.client.activeClients).toBe(8);
        expect(metrics.client.nps).toBe(75); // Default baseline

        // Verify Brain Storage
        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("performance_metrics_last_30_days"),
            expect.any(String),
            expect.any(String),
            [],
            undefined, undefined, false, undefined, undefined, 0, 0,
            "performance_analytics"
        );
    });

    it("should handle missing data gracefully (fallbacks)", async () => {
        // Force errors in APIs
        mockXeroClient.accountingApi.getInvoices.mockRejectedValue(new Error("Xero Down"));
        mockLinearClient.issues.mockRejectedValue(new Error("Linear Down"));
        mockHubSpotClient.crm.deals.searchApi.doSearch.mockRejectedValue(new Error("HubSpot Down"));

        const result = await analyzePerfTool({ timeframe: "last_quarter" });
        const metrics = JSON.parse(result.content[0].text);

        console.log("Fallback Metrics:", JSON.stringify(metrics, null, 2));

        // Expect Fallback Values
        expect(metrics.financial.revenue).toBe(50000);
        expect(metrics.delivery.velocity).toBe(20);
        expect(metrics.client.activeClients).toBe(10);
    });
});
