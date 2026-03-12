import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ForecastingServer } from "../../src/mcp_servers/forecasting/index.js";
import { BrainServer } from "../../src/mcp_servers/brain/index.js";
import { registerForecastingIntegrationTools } from "../../src/mcp_servers/business_ops/tools/forecasting_integration.js";
import { registerResourceAllocationTools } from "../../src/mcp_servers/business_ops/tools/resource_allocation.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "crypto";

// Mocking dependencies to prevent actual network/DB calls during integration testing
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    return {
        Client: class MockClient {
            public name: string;
            constructor(info: {name: string}, options: any) {
                this.name = info.name;
            }
            async connect() {}
            async close() {}
            async callTool({ name, arguments: args }: any) {
                if (name === "brain_store") {
                    // Simulate successful store
                    return {
                        content: [{ type: "text", text: "Memory stored successfully." }]
                    };
                }
                if (name === "brain_query") {
                    if (this.name.includes("forecasting")) {
                        // Mock return for apply_forecast_to_strategy
                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify([{
                                    id: randomUUID(),
                                    taskId: "forecast_margin_123",
                                    timestamp: Date.now(),
                                    company: args.company || "test-company",
                                    userPrompt: "Strategic Forecast for margin over 30 days.",
                                    agentResponse: JSON.stringify([{ predicted_value: 0.15, upper_bound: 0.20, lower_bound: 0.10 }]),
                                    type: "strategic_forecast"
                                }])
                            }]
                        };
                    } else {
                        // Mock return for allocate_resources_optimally
                        return {
                            content: [{
                                type: "text",
                                text: JSON.stringify([{
                                    id: randomUUID(),
                                    taskId: "forecast_demand_123",
                                    timestamp: Date.now(),
                                    company: "test-client",
                                    userPrompt: "Strategic Forecast for token_usage over 14 days.",
                                    agentResponse: JSON.stringify([{ predicted_value: 50000, upper_bound: 60000, lower_bound: 40000 }]),
                                    type: "strategic_forecast"
                                }])
                            }]
                        };
                    }
                }
                if (name === "read_strategy") {
                    return {
                        content: [{ type: "text", text: JSON.stringify({ vision: "Aggressive Growth", risk_tolerance: "high" }) }]
                    };
                }
                if (name === "propose_strategic_pivot") {
                    return {
                        content: [{ type: "text", text: "Successfully applied strategic pivot." }]
                    };
                }
                return { isError: true, content: [{ text: "Unknown tool" }] };
            }
        }
    };
});

vi.mock("../../src/llm/index.js", () => {
    return {
        createLLM: vi.fn().mockImplementation(() => ({
            generate: vi.fn().mockImplementation(async (prompt: string) => {
                if (prompt.includes("Chief Operating Officer AI")) {
                    return {
                        message: JSON.stringify({
                            recommendation: "scale_up",
                            reasoning: "Forecasts indicate a massive spike in token usage over the next 14 days. Preemptively scaling up.",
                            suggested_budget_adjustment: 0.15,
                            confidence_score: 90
                        })
                    };
                }
                if (prompt.includes("Chief Strategy Officer AI")) {
                    return {
                        message: "The predicted margin of 15% is below our 20% target. We must pivot to higher margin services immediately."
                    };
                }
                return { message: "Mock LLM Response" };
            }),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        }))
    };
});

vi.mock("../../src/llm.js", () => {
    return {
        createLLM: vi.fn().mockImplementation(() => ({
            generate: vi.fn().mockImplementation(async (prompt: string) => {
                if (prompt.includes("Chief Operating Officer AI")) {
                    return {
                        message: JSON.stringify({
                            recommendation: "scale_up",
                            reasoning: "Forecasts indicate a massive spike in token usage over the next 14 days. Preemptively scaling up.",
                            suggested_budget_adjustment: 0.15,
                            confidence_score: 90
                        })
                    };
                }
                if (prompt.includes("Chief Strategy Officer AI")) {
                    return {
                        message: "The predicted margin of 15% is below our 20% target. We must pivot to higher margin services immediately."
                    };
                }
                return { message: "Mock LLM Response" };
            }),
            embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1))
        }))
    };
});

vi.mock("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js", () => {
    return {
        getFleetStatusLogic: vi.fn().mockResolvedValue([{
            projectId: "proj_1",
            company: "test-client",
            status: "active",
            agents: 3
        }])
    };
});

vi.mock("../../src/mcp_servers/business_ops/tools/performance_analytics.js", () => {
    return {
        collectPerformanceMetrics: vi.fn().mockResolvedValue({
            cpu_usage: 45,
            memory_usage: 60,
            active_tasks: 12
        })
    };
});

describe("Phase 29: Forecasting Integration Validation", () => {
    let forecastingServer: ForecastingServer;
    let businessOpsServer: McpServer;

    beforeEach(() => {
        forecastingServer = new ForecastingServer();
        businessOpsServer = new McpServer({ name: "mock_business_ops", version: "1.0.0" });
        registerResourceAllocationTools(businessOpsServer);
        registerForecastingIntegrationTools(businessOpsServer);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should allow forecasting MCP to store strategic forecasts in the Brain", async () => {
        const server: any = forecastingServer.getServer();
        const tools = server._registeredTools || server.registeredTools || server.tools;
        // The properties in `tools` Map/Object are often directly keyed by tool name.
        let storeForecastTool = tools instanceof Map ? tools.get("store_forecast") : tools["store_forecast"];
        if (!storeForecastTool) {
            storeForecastTool = Object.values(tools).find((t: any) => t.name === "store_forecast");
        }

        const result: any = await storeForecastTool.handler({
            metric_name: "margin",
            horizon_days: 30,
            forecast_data: JSON.stringify([{ predicted_value: 0.15, upper_bound: 0.20, lower_bound: 0.10 }]),
            company: "test-company"
        }, {} as any);

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("Successfully stored strategic forecast");
    });

    it("should allocate resources optimally by querying recent strategic forecasts", async () => {
        const tools: any = (businessOpsServer as any)._registeredTools || (businessOpsServer as any).registeredTools || (businessOpsServer as any).tools;
        let allocateTool = tools instanceof Map ? tools.get("allocate_resources_optimally") : tools["allocate_resources_optimally"];
        if (!allocateTool) {
             allocateTool = Object.values(tools).find((t: any) => t.name === "allocate_resources_optimally");
        }
        const result: any = await allocateTool.handler({
            dry_run: true
        }, {} as any);

        expect(result.isError).toBeUndefined();

        const parsedResult = JSON.parse(result.content[0].text);
        expect(parsedResult.recommendations).toHaveLength(1);
        expect(parsedResult.recommendations[0].recommendation).toBe("scale_up");
        expect(parsedResult.recommendations[0].reasoning).toContain("massive spike in token usage");
    });

    it("should apply forecast to strategy and propose a strategic pivot", async () => {
        const tools: any = (businessOpsServer as any)._registeredTools || (businessOpsServer as any).registeredTools || (businessOpsServer as any).tools;
        let applyForecastTool = tools instanceof Map ? tools.get("apply_forecast_to_strategy") : tools["apply_forecast_to_strategy"];
        if (!applyForecastTool) {
            applyForecastTool = Object.values(tools).find((t: any) => t.name === "apply_forecast_to_strategy");
        }

        // Run with dry_run=false to ensure the pivot is proposed
        const result: any = await applyForecastTool.handler({
            company: "test-company",
            dry_run: false
        }, {} as any);

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("Successfully evaluated strategic forecast and applied a strategic pivot");
        expect(result.content[0].text).toContain("We must pivot to higher margin services immediately.");
    });
});
