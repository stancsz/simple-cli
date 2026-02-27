import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerPricingOptimizationTools } from "../../src/mcp_servers/business_ops/tools/pricing_optimization.js";

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

describe("Pricing Optimization Validation", () => {
    let optimizePricingTool: any;
    const mockServer = { tool: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        registerPricingOptimizationTools(mockServer as any);
        const calls = (mockServer.tool as any).mock.calls;
        optimizePricingTool = calls.find((c: any) => c[0] === "optimize_pricing_strategy")?.[3];
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should generate pricing recommendations with full data", async () => {
        // 1. Mock Data Fetching
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

        // 2. Mock Memory (No recent runs)
        mockEpisodicMemory.recall.mockResolvedValue([]);

        // 3. Mock LLM Response
        const mockRecommendation = [
            {
                service_name: "Web Dev",
                current_price: 100,
                recommended_price: 120,
                confidence_score: 0.9,
                reasoning: "High demand and efficiency."
            }
        ];
        mockLLM.generate.mockResolvedValue({
            message: JSON.stringify(mockRecommendation)
        });

        const result = await optimizePricingTool({
            current_services: [{ name: "Web Dev", current_price: 100 }]
        });
        const recommendations = JSON.parse(result.content[0].text);

        expect(recommendations).toHaveLength(1);
        expect(recommendations[0].recommended_price).toBe(120);
        expect(mockEpisodicMemory.store).toHaveBeenCalled();
    });

    it("should handle idempotency (skip if run recently)", async () => {
        // Mock Memory (Recent run exists)
        const cachedResponse = JSON.stringify([{
            service_name: "Web Dev",
            current_price: 100,
            recommended_price: 105,
            confidence_score: 0.7,
            reasoning: "Cached result"
        }]);

        mockEpisodicMemory.recall.mockResolvedValue([{
            timestamp: new Date().toISOString(),
            agentResponse: cachedResponse
        }]);

        const result = await optimizePricingTool({
            current_services: [{ name: "Web Dev", current_price: 100 }]
        });

        expect(result.content[0].text).toBe(cachedResponse);
        expect(mockLLM.generate).not.toHaveBeenCalled();
    });

    it("should use fallback if LLM fails", async () => {
        mockEpisodicMemory.recall.mockResolvedValue([]);
        mockLLM.generate.mockRejectedValue(new Error("LLM Down"));

        // Force errors in APIs to test full fallback path
        mockXeroClient.accountingApi.getInvoices.mockRejectedValue(new Error("Xero Down"));

        const result = await optimizePricingTool({
            current_services: [{ name: "Consulting", current_price: 200 }]
        });
        const recommendations = JSON.parse(result.content[0].text);

        expect(recommendations[0].reasoning).toContain("fallback");
        expect(recommendations[0].recommended_price).toBeGreaterThan(200);
    });
});
