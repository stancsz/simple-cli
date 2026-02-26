import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerServiceAdjustmentTools } from "../../src/mcp_servers/business_ops/tools/service_adjustment.js";

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

    it("should generate service recommendations with full data", async () => {
        // 1. Mock Data Fetching (Xero, Linear, HubSpot)
        mockXeroClient.accountingApi.getInvoices.mockResolvedValue({
            body: {
                invoices: [{ total: 10000, status: "PAID" }]
            }
        });

        mockLinearClient.issues.mockResolvedValue({
            nodes: [
                { state: Promise.resolve({ type: "completed" }) },
                { state: Promise.resolve({ type: "started" }) }
            ]
        });

        mockHubSpotClient.crm.deals.searchApi.doSearch.mockResolvedValue({
            results: [{ id: "deal_1" }]
        });

        // 2. Mock Memory
        mockEpisodicMemory.recall.mockResolvedValue([]);

        // 3. Mock LLM Response
        const mockRecommendations = [
            {
                action: "modify",
                service_name: "Web Development",
                target_segment: "Startups",
                suggested_price: 150,
                estimated_impact: "High",
                reasoning: "Market trends indicate 10% growth."
            }
        ];
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(mockRecommendations)
        });

        const result = await adjustServiceTool({
            current_offerings: [{ name: "Web Development", current_price: 120 }],
            analysis_period: "last_quarter"
        });
        const recommendations = JSON.parse(result.content[0].text);

        expect(recommendations).toHaveLength(1);
        expect(recommendations[0].suggested_price).toBe(150);
        expect(mockEpisodicMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("service_adjustment_"),
            "Service Offering Recommendations",
            expect.any(String),
            expect.arrayContaining(["service_optimization", "strategy"]),
            undefined, undefined, false, undefined, undefined, 0, 0,
            "service_adjustment"
        );
    });

    it("should handle LLM failure with fallback recommendations", async () => {
        // Mock API success but LLM failure
        mockXeroClient.accountingApi.getInvoices.mockResolvedValue({ body: { invoices: [] } });
        mockLinearClient.issues.mockResolvedValue({ nodes: [] });
        mockHubSpotClient.crm.deals.searchApi.doSearch.mockResolvedValue({ results: [] });

        mockLLM.generate.mockRejectedValue(new Error("LLM Down"));

        const result = await adjustServiceTool({
            current_offerings: [{ name: "Consulting", current_price: 200 }],
            analysis_period: "last_30_days"
        });
        const recommendations = JSON.parse(result.content[0].text);

        expect(recommendations[0].reasoning).toContain("Fallback");
        expect(recommendations[0].suggested_price).toBeGreaterThan(200);
    });

    it("should handle missing external API data gracefully (robustness check)", async () => {
        // Mock all APIs failing
        mockXeroClient.accountingApi.getInvoices.mockRejectedValue(new Error("Xero Down"));
        mockLinearClient.issues.mockRejectedValue(new Error("Linear Down"));
        mockHubSpotClient.crm.deals.searchApi.doSearch.mockRejectedValue(new Error("HubSpot Down"));

        // LLM still works
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify([{
                action: "retire",
                service_name: "Legacy Service",
                target_segment: "None",
                suggested_price: 0,
                estimated_impact: "None",
                reasoning: "Retiring due to lack of data."
            }])
        });

        const result = await adjustServiceTool({
            current_offerings: [{ name: "Legacy Service", current_price: 50 }],
            analysis_period: "year_to_date"
        });
        const recommendations = JSON.parse(result.content[0].text);

        expect(recommendations[0].action).toBe("retire");
    });
});
