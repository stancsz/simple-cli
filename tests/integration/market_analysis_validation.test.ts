import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerMarketAnalysisTools } from "../../src/mcp_servers/business_ops/tools/market_analysis.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Mocks
const mockLLMGenerate = vi.fn();
const mockMemoryRecall = vi.fn();
const mockMemoryStore = vi.fn();
const mockMemoryInit = vi.fn();

vi.mock("../../src/llm.js", () => ({
    createLLM: () => ({
        generate: mockLLMGenerate
    })
}));

vi.mock("../../src/brain/episodic.js", () => ({
    EpisodicMemory: class {
        init = mockMemoryInit;
        recall = mockMemoryRecall;
        store = mockMemoryStore;
    }
}));

// Mock Fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Market Analysis Tools", () => {
    let server: McpServer;

    beforeEach(() => {
        server = new McpServer({ name: "test", version: "1.0.0" });
        registerMarketAnalysisTools(server);
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it("should analyze competitor pricing with fresh fetch", async () => {
        // Setup Mocks
        mockMemoryRecall.mockResolvedValue([]); // No cache
        mockFetch.mockResolvedValue({
            ok: true,
            text: async () => "<html><body><h1>Competitor Pricing</h1><p>Plan A: $10/mo</p></body></html>",
            headers: new Headers()
        });
        mockLLMGenerate.mockResolvedValue({
            message: JSON.stringify({
                pricing_model: "Subscription",
                extracted_offerings: [{ plan: "Plan A", price: 10, period: "month", features: [] }],
                value_proposition: "Cheap",
                strengths: ["Price"],
                weaknesses: [],
                target_audience: "SMB"
            })
        });

        // Execute Tool
        // @ts-ignore
        // _registeredTools is where McpServer stores tools in recent versions, keyed by name
        const tool = server._registeredTools["analyze_competitor_pricing"];
        // @ts-ignore
        const result = await tool.handler({ competitor_urls: ["http://example.com"] }, { request: {}, signal: new AbortController().signal });

        // Verify
        const content = JSON.parse(result.content[0].text);
        expect(content).toHaveLength(1);
        expect(content[0].url).toBe("http://example.com");
        expect(content[0].pricing_model).toBe("Subscription");
        expect(mockFetch).toHaveBeenCalledWith("http://example.com", expect.any(Object));
        expect(mockMemoryStore).toHaveBeenCalled();
    });

    it("should use cached competitor analysis if valid", async () => {
        // Setup Cache
        const cachedAnalysis = {
            url: "http://example.com",
            pricing_model: "Cached Model",
            extracted_offerings: [],
            last_analyzed: new Date().toISOString()
        };
        mockMemoryRecall.mockResolvedValue([{
            timestamp: Date.now(),
            agentResponse: JSON.stringify(cachedAnalysis)
        }]);

        // Execute Tool
        // @ts-ignore
        const tool = server._registeredTools["analyze_competitor_pricing"];
        // @ts-ignore
        const result = await tool.handler({ competitor_urls: ["http://example.com"] }, { request: {}, signal: new AbortController().signal });

        // Verify
        const content = JSON.parse(result.content[0].text);
        expect(content[0].pricing_model).toBe("Cached Model");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should collect market data with LLM enhancement", async () => {
        mockLLMGenerate.mockResolvedValue({
            message: JSON.stringify({
                trends: ["AI is booming"],
                opportunities: ["Niche SaaS"]
            })
        });

        // Execute Tool
        // @ts-ignore
        const tool = server._registeredTools["collect_market_data"];
        // @ts-ignore
        const result = await tool.handler({ sector: "Software", region: "US" }, { request: {}, signal: new AbortController().signal });

        // Verify
        const content = JSON.parse(result.content[0].text);
        expect(content.sector).toBe("Software");
        expect(content.trends).toContain("AI is booming"); // Merged from LLM
        expect(content.market_growth_rate).toBeDefined(); // From base logic
    });
});
