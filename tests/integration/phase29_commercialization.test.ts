import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAutomatedBiddingTools } from "../../src/mcp_servers/commerce/automated_bidding.js";
import { registerRevenueForecastingTools } from "../../src/mcp_servers/commerce/revenue_forecasting.js";
import { registerServicePackagerTools } from "../../src/mcp_servers/commerce/service_packager.js";

// --- Mocks Setup ---

// 1. External APIs (Xero)
const mockXeroClient = {
    accountingApi: {
        getInvoices: vi.fn()
    }
};

vi.mock("../../src/mcp_servers/business_ops/xero_tools.js", () => ({
    getXeroClient: vi.fn(() => Promise.resolve(mockXeroClient)),
    getTenantId: vi.fn(() => Promise.resolve("tenant_123"))
}));

// 2. Internal Core (LLM, Brain)
const mockLLM = {
    generate: vi.fn()
};

const mockEpisodicMemory = {
    init: vi.fn(),
    recall: vi.fn()
};

vi.mock("../../src/llm.js", () => ({
    createLLM: vi.fn(() => mockLLM)
}));

vi.mock("../../src/brain/episodic.js", () => ({
    EpisodicMemory: vi.fn(() => mockEpisodicMemory)
}));

// --- Test Suite ---

describe("Phase 29: Autonomous Business Scaling & Commercialization Validation", () => {
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

        // Register commerce tools
        registerAutomatedBiddingTools(server);
        registerRevenueForecastingTools(server);
        registerServicePackagerTools(server);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should generate a revenue forecast using Xero data and pipeline metrics", async () => {
        console.log("Step 1: Forecasting Revenue...");

        // Mock Xero Invoices (Recent Revenue)
        mockXeroClient.accountingApi.getInvoices.mockResolvedValue({
            body: {
                invoices: [
                    { total: 50000, status: "PAID" },
                    { total: 25000, status: "PAID" },
                    { total: 10000, status: "AUTHORISED" } // Unpaid, should be ignored
                ]
            }
        });

        // Mock LLM Response for Forecasting
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify({
                predicted_revenue: 150000,
                confidence_interval: "$130,000 - $170,000",
                key_drivers: ["High pipeline value", "Consistent historical growth"]
            })
        });

        const forecastData = await registeredTools["revenue_forecasting"]({
            forecast_period_days: 90
        });

        const content = JSON.parse(forecastData.content[0].text);

        expect(content.historical_revenue).toBe(75000); // 50k + 25k
        expect(content.pipeline_value).toBe(100000); // Mocked inside the tool logic
        expect(content.forecast.predicted_revenue).toBe(150000);
        expect(content.forecast.key_drivers).toContain("High pipeline value");

        console.log("✅ Revenue Forecasted successfully: Predicted $" + content.forecast.predicted_revenue);
    });

    it("should automatically package services based on historical success", async () => {
        console.log("Step 2: Packaging Services...");

        // Mock Memory for past successful projects
        mockEpisodicMemory.recall.mockResolvedValue([
            { project_name: "FinTech App", margin: 0.5 },
            { project_name: "E-Commerce Platform", margin: 0.45 }
        ]);

        // Mock LLM Response for Service Packaging
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify([
                {
                    package_name: "MVP Starter Kit",
                    tier: "Basic",
                    price: 25000,
                    deliverables: ["UI/UX Design", "Frontend React App", "Basic Backend API"],
                    estimated_delivery_time: 30
                },
                {
                    package_name: "Enterprise Scale Plan",
                    tier: "Pro",
                    price: 75000,
                    deliverables: ["Full Stack App", "K8s Deployment", "Security Audit"],
                    estimated_delivery_time: 90
                }
            ])
        });

        const packageData = await registeredTools["service_packager"]({
            target_industry: "Technology",
            desired_margin: 0.5
        });

        const content = JSON.parse(packageData.content[0].text);

        expect(content).toHaveLength(2);
        expect(content[0].package_name).toBe("MVP Starter Kit");
        expect(content[0].price).toBe(25000);
        expect(content[1].tier).toBe("Pro");

        console.log("✅ Services Packaged successfully:", content.map((c: any) => c.package_name).join(", "));
    });

    it("should autonomously bid on marketplace opportunities with a high match score", async () => {
        console.log("Step 3: Automated Bidding on Upwork...");

        // Mock Memory for past bids
        mockEpisodicMemory.recall.mockResolvedValue([
            { bid_id: "upwork_1", success: true, client_feedback: "Great communication" }
        ]);

        // Mock LLM Response for Automated Bidding
        mockLLM.generate.mockResolvedValueOnce({
            message: JSON.stringify([{
                bid_amount: 15000,
                proposal_text: "Based on our successful delivery of similar React/Node applications, we propose...",
                match_score: 0.95
            }])
        });

        const bidData = await registeredTools["automated_bidding"]({
            marketplace: "Upwork",
            opportunity_description: "Looking for an agency to build a full-stack React/Node application with high availability.",
            budget: 20000
        });

        const content = JSON.parse(bidData.content[0].text);

        expect(content).toHaveLength(1);
        expect(content[0].bid_amount).toBe(15000);
        expect(content[0].match_score).toBeGreaterThan(0.8);
        expect(content[0].proposal_text).toContain("React/Node");

        console.log("✅ Automated Bid generated successfully for amount: $" + content[0].bid_amount + " (Match Score: " + content[0].match_score + ")");
    });
});
