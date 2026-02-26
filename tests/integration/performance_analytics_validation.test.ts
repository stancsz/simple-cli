import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerPerformanceAnalyticsTools } from "../../src/mcp_servers/business_ops/tools/performance_analytics.js";

// Mock Dependencies
const mockLinearClient = {
    projects: vi.fn(),
    issues: vi.fn()
};

const mockHubSpotClient = {
    crm: {
        companies: {
            searchApi: { doSearch: vi.fn() },
            basicApi: { getPage: vi.fn() }
        }
    }
};

const mockXeroClient = {
    accountingApi: {
        getReportProfitAndLoss: vi.fn(),
        getInvoices: vi.fn()
    }
};

const mockEpisodicMemory = {
    init: vi.fn(),
    store: vi.fn()
};

// Hoist mocks
vi.mock("@linear/sdk", () => {
    return {
        LinearClient: vi.fn(() => mockLinearClient)
    };
});

vi.mock("@hubspot/api-client", () => {
    return {
        Client: vi.fn(() => mockHubSpotClient)
    };
});

vi.mock("xero-node", () => {
    return {
        XeroClient: vi.fn(() => mockXeroClient)
    };
});

vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: vi.fn(() => mockEpisodicMemory)
    };
});

// Mock local tools
vi.mock("../../src/mcp_servers/business_ops/xero_tools.js", () => {
    return {
        getXeroClient: vi.fn(() => Promise.resolve(mockXeroClient)),
        getTenantId: vi.fn(() => Promise.resolve("tenant_123"))
    };
});

describe("Performance Analytics Integration", () => {
    let analyzeTool: any;
    const mockServer = { tool: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.LINEAR_API_KEY = "mock_linear";
        process.env.HUBSPOT_ACCESS_TOKEN = "mock_hubspot";
        process.env.XERO_CLIENT_ID = "mock_xero";
        process.env.XERO_CLIENT_SECRET = "mock_xero_secret";

        // Register tools
        registerPerformanceAnalyticsTools(mockServer as any);

        // Extract tool
        const calls = (mockServer.tool as any).mock.calls;
        analyzeTool = calls.find((c: any) => c[0] === "analyze_performance_metrics")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should aggregate data correctly when all services are available (Happy Path)", async () => {
        // Mock Xero Data (Revenue & Expenses)
        mockXeroClient.accountingApi.getInvoices.mockImplementation((tenantId, _, where) => {
            // Ensure dates are within range (last month to today)
            const date = new Date();
            // Subtract 2 days to be safe
            date.setDate(date.getDate() - 2);
            const dateStr = date.toISOString();

            if (where && where.includes("ACCPAY")) {
                // Bills
                return Promise.resolve({
                    body: { invoices: [{ total: 5000, date: dateStr }] }
                });
            } else {
                // Invoices (Revenue)
                return Promise.resolve({
                    body: { invoices: [{ total: 20000, date: dateStr }] }
                });
            }
        });

        // Mock Linear Data (Velocity & Efficiency)
        const mockIssues = {
            nodes: [
                { state: Promise.resolve({ type: "completed" }), completedAt: new Date(), createdAt: new Date(Date.now() - 86400000) },
                { state: Promise.resolve({ type: "completed" }), completedAt: new Date(), createdAt: new Date(Date.now() - 86400000) },
                { state: Promise.resolve({ type: "backlog" }), createdAt: new Date(Date.now() - 86400000 * 5) } // 5 days old
            ]
        };
        mockLinearClient.issues.mockResolvedValue(mockIssues);

        // Mock HubSpot Data (Client Satisfaction)
        mockHubSpotClient.crm.companies.basicApi.getPage.mockResolvedValue({
            results: [
                { properties: { nps_score: "80", client_satisfaction_score: "9" } },
                { properties: { nps_score: "90", client_satisfaction_score: "10" } }
            ]
        });

        const result = await analyzeTool({
            timeframe: "last_month"
        });

        const report = JSON.parse(result.content[0].text);

        // Assertions
        // Financial: 20000 Revenue - 5000 Expenses = 15000 Profit. Margin = 75%
        expect(report.financial.revenue).toBe(20000);
        expect(report.financial.expenses).toBe(5000);
        expect(report.financial.profit).toBe(15000);
        expect(report.financial.margin).toBe(75);

        // Operational: 2 completed / 4 weeks (approx) = 0.5. Backlog age 5 days.
        expect(report.operational.velocity).toBeGreaterThan(0);
        // Allow tiny variance for execution time
        expect(report.operational.backlogAgeDays).toBeCloseTo(5, 1);

        // Client: Avg NPS 85, Avg Sat 9.5
        expect(report.client.npsScore).toBe(85);
        expect(report.client.satisfactionScore).toBe(9.5);

        // Brain Storage
        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("performance_audit_last_month"),
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

    it("should handle partial data gracefully (Xero Failure)", async () => {
        // Mock Xero Failure
        mockXeroClient.accountingApi.getInvoices.mockRejectedValue(new Error("API Error"));

        // Mock Linear Success
        mockLinearClient.issues.mockResolvedValue({ nodes: [] });

        // Mock HubSpot Success
        mockHubSpotClient.crm.companies.basicApi.getPage.mockResolvedValue({ results: [] });

        const result = await analyzeTool({ timeframe: "last_month" });
        const report = JSON.parse(result.content[0].text);

        expect(report.financial.revenue).toBe(0);
        expect(report.financial.profit).toBe(0);

        // Should still return report structure
        expect(report.overallHealthScore).toBeDefined();
    });

    it("should filter by client_id correctly", async () => {
        // Mock Linear Project Lookup
        mockLinearClient.projects.mockResolvedValue({ nodes: [{ id: "proj_123" }] });
        mockLinearClient.issues.mockResolvedValue({ nodes: [] });

        // Mock HubSpot Company Search
        mockHubSpotClient.crm.companies.searchApi.doSearch.mockResolvedValue({
            results: [{ properties: { nps_score: "100" } }]
        });

        // Mock Xero (skipped for client filter in current implementation logic or mocked as standard)
        mockXeroClient.accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [] } });

        await analyzeTool({ timeframe: "last_month", client_id: "Acme Corp" });

        // Verify Linear called with project filter
        expect(mockLinearClient.projects).toHaveBeenCalledWith(
            expect.objectContaining({ filter: { name: { contains: "Acme Corp" } } })
        );

        // Verify HubSpot called with search
        expect(mockHubSpotClient.crm.companies.searchApi.doSearch).toHaveBeenCalledWith(
            expect.objectContaining({
                filterGroups: [{ filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: "Acme Corp" }] }]
            })
        );
    });
});
