import { describe, it, expect, vi, beforeEach } from "vitest";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { recordStrategicMetric, queryForecastingInsights } from "../../src/mcp_servers/brain/tools/forecasting_integration.ts";
import * as llmModule from "../../src/llm.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Mock EpisodicMemory
vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: class {
            constructor() {}
            store = vi.fn().mockResolvedValue(true);
            recall = vi.fn().mockResolvedValue([]);
        }
    };
});

// Mock LLM
vi.mock("../../src/llm.js", () => ({
    createLLM: vi.fn(() => ({
        generate: vi.fn().mockResolvedValue({ message: "Mocked synthesized report." }),
        embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
    }))
}));

// Mock MCP Client
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    return {
        Client: class {
            constructor() {}
            connect = vi.fn().mockResolvedValue(true);
            close = vi.fn().mockResolvedValue(true);
            listTools = vi.fn().mockResolvedValue({ tools: [{ name: "forecast_metric" }, { name: "query_forecasting_insights" }] });
            callTool = vi.fn().mockImplementation(({ name, arguments: args }) => {
                if (name === "forecast_metric") {
                    return Promise.resolve({
                        isError: false,
                        content: [{ type: "text", text: JSON.stringify([{ value: 100, date: "2024-01-01" }, { value: 120, date: "2024-02-01" }]) }]
                    });
                } else if (name === "query_forecasting_insights") {
                    return Promise.resolve({
                        isError: false,
                        content: [{ type: "text", text: JSON.stringify({ report: "Mocked insights", forecasts: {} }) }]
                    });
                }
                return Promise.resolve({ isError: true, content: [{ type: "text", text: "Tool not mocked" }] });
            });
        }
    };
});

// Mock readStrategy
vi.mock("../../src/mcp_servers/brain/tools/strategy.js", () => ({
    readStrategy: vi.fn().mockResolvedValue({
        vision: "Grow 10x",
        objectives: ["Dominate AI"],
        policies: {},
        timestamp: Date.now()
    })
}));

describe("Forecasting & Brain Integration", () => {
    let memory: EpisodicMemory;

    beforeEach(() => {
        vi.clearAllMocks();
        memory = new EpisodicMemory("/mock/path");
    });

    it("should initialize test suite correctly", () => {
        expect(memory).toBeDefined();
    });

    it("recordStrategicMetric should store a metric with type 'strategic_metric'", async () => {
        const result = await recordStrategicMetric(
            memory,
            "api_latency",
            120,
            "2024-03-01T12:00:00Z",
            "mocked_source",
            0.95,
            "TestCo"
        );

        expect(result.metric_name).toBe("api_latency");
        expect(result.value).toBe(120);
        expect(result.taskId).toMatch(/^metric_/);
        expect(memory.store).toHaveBeenCalledWith(
            expect.any(String),
            "Strategic Metric Recorded: api_latency",
            expect.stringContaining('"value":120'),
            [],
            "TestCo",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            "strategic_metric"
        );
    });

    it("queryForecastingInsights should retrieve metrics, call forecasting server, and return a synthesized report", async () => {
        // Mock recall to return some historical data
        (memory.recall as any).mockResolvedValue([
            {
                userPrompt: "Strategic Metric Recorded: api_latency",
                agentResponse: JSON.stringify({ value: 110, timestamp: "2024-02-01T12:00:00Z" })
            }
        ]);

        const insights = await queryForecastingInsights(
            memory,
            ["api_latency"],
            30,
            "TestCo"
        );

        expect(insights.report).toBe("Mocked synthesized report.");
        expect(insights.strategy_context).toBe("Applied");
        expect(insights.forecasts["api_latency"]).toBeDefined();

        // Assert that the mocked LLM was called to synthesize the report
        const mockGenerate = (llmModule.createLLM as any).mock.results[0].value.generate;
        expect(mockGenerate).toHaveBeenCalledWith(
            expect.stringContaining("Synthesize the following forecasting insights"),
            []
        );
    });

    it("should simulate the full loop: record metric -> brain storage -> strategic query -> Business Ops decision", async () => {
        // Step 1 & 2: Record a metric into Brain storage
        await recordStrategicMetric(
            memory,
            "llm_token_usage",
            5000,
            "2024-04-01T10:00:00Z",
            "usage_monitor",
            0.99,
            "TestCo"
        );
        expect(memory.store).toHaveBeenCalledWith(
            expect.any(String),
            "Strategic Metric Recorded: llm_token_usage",
            expect.stringContaining('"value":5000'),
            [],
            "TestCo",
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            "strategic_metric"
        );

        // Step 3 & 4: Business Ops calls forecast_resource_demand, which calls Brain's query_forecasting_insights
        (memory.recall as any).mockResolvedValue([
            {
                userPrompt: "Strategic Metric Recorded: llm_token_usage",
                agentResponse: JSON.stringify({ value: 5000, timestamp: "2024-04-01T10:00:00Z" })
            }
        ]);

        const insights = await queryForecastingInsights(
            memory,
            ["llm_token_usage"],
            14,
            "TestCo"
        );

        // Verify the Brain queried the forecast correctly and synthesized it
        expect(insights.forecasts["llm_token_usage"]).toBeDefined();
        expect(insights.report).toBe("Mocked synthesized report.");

        // Ensure that Business Ops received the synthesized output (simulated by our test)
        expect(insights.strategy_context).toBe("Applied");
    });
});
