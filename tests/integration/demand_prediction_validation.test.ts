import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerDemandPredictionTools } from "../../src/mcp_servers/business_ops/tools/demand_prediction.js";
import { _resetDb, getDb, record_metric } from "../../src/mcp_servers/forecasting/models.js";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

// Mock Active Projects (Clients)
vi.mock("../../src/mcp_servers/business_ops/tools/swarm_fleet_management.js", () => {
    return {
        getActiveProjects: vi.fn().mockResolvedValue([
            {
                id: "proj_1",
                name: "Client_A",
                issues: vi.fn().mockResolvedValue({ nodes: new Array(15).fill({ state: { type: "in_progress" } }) })
            },
            {
                id: "proj_2",
                name: "Client_B",
                issues: vi.fn().mockResolvedValue({ nodes: new Array(2).fill({ state: { type: "todo" } }) })
            }
        ])
    };
});

// Mock EpisodicMemory (Brain Context)
vi.mock("../../src/brain/episodic.js", () => {
    return {
        EpisodicMemory: class {
            constructor() {}
            async recall(query: string, limit: number, company: string) {
                if (company === "Client_A") {
                    return [{ agentResponse: "High priority blockers reported recently." }];
                }
                return [{ agentResponse: "Routine maintenance tasks." }];
            }
            async store() { return "mock_memory_id"; }
        }
    };
});

// Mock LLM
vi.mock("../../src/llm/index.js", () => {
    return {
        createLLM: vi.fn().mockImplementation(() => ({
            disableRouting: true,
            generate: vi.fn().mockImplementation(async (prompt, messages) => {
                const promptStr = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
                if (promptStr.includes("Client_A")) {
                    return {
                        message: JSON.stringify({
                            recommendation: "scale_up",
                            confidence_score: 0.95,
                            reasoning: "Forecast shows sharp increase and high current load."
                        })
                    };
                } else {
                    return {
                        message: JSON.stringify({
                            recommendation: "scale_down",
                            confidence_score: 0.85,
                            reasoning: "Forecast is near zero. Low activity."
                        })
                    };
                }
            })
        }))
    };
});

// Mock scaleSwarmLogic
vi.mock("../../src/mcp_servers/scaling_engine/scaling_orchestrator.js", () => {
    return {
        scaleSwarmLogic: vi.fn().mockResolvedValue({
            status: "success",
            action: "spawn",
            agent_id: "agent_123"
        })
    };
});

// Mock MCP Client to directly call Forecasting functions without spinning up a real process
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    return {
        Client: class MockClient {
            constructor() {}
            async connect() {}
            async close() {}
            async callTool({ name, arguments: args }: any) {
                if (name === "record_metric") {
                    // Directly call the internal forecasting function to ensure it lands in the DB for the test
                    const { record_metric: rm } = await import("../../src/mcp_servers/forecasting/models.js");
                    rm(args.metric_name, args.value, args.timestamp, args.company);
                    return { content: [{ text: "Successfully recorded" }] };
                }
                if (name === "forecast_metric") {
                    const { forecast_metric: fm } = await import("../../src/mcp_servers/forecasting/models.js");
                    const res = fm(args.metric_name, args.horizon_days, args.company);
                    return { content: [{ text: JSON.stringify(res) }] };
                }
                return { isError: true };
            }
        }
    };
});

describe("Phase 29: Demand Prediction Validation", () => {
    let server: McpServer;

    beforeEach(() => {
        server = new McpServer({ name: "test-server", version: "1.0.0" });
        registerDemandPredictionTools(server);

        _resetDb();
        const dbPath = join(process.cwd(), '.agent', 'data', 'forecasting.db');
        if (existsSync(dbPath)) {
           unlinkSync(dbPath);
        }

        // Seed some historical data so simple-statistics has enough points to linear regress
        const baseDateMs = new Date("2024-01-01T00:00:00Z").getTime();
        const msPerDay = 1000 * 60 * 60 * 24;

        // Client A has an increasing trend: 5, 10, 15
        for (let i = 0; i < 3; i++) {
            record_metric("linear_issues", 5 * (i + 1), new Date(baseDateMs + (i * msPerDay)).toISOString(), "Client_A");
        }

        // Client B has a flat/decreasing trend: 2, 2, 2
        for (let i = 0; i < 3; i++) {
            record_metric("linear_issues", 2, new Date(baseDateMs + (i * msPerDay)).toISOString(), "Client_B");
        }
    });

    it("should predict client demand and trigger auto-scaling when yoloMode is enabled", async () => {
        // Find the tool
        const tools = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        const predictTool = tools["predict_client_demand"];

        expect(predictTool).toBeDefined();

        // Run the tool with YOLO mode on
        const result = await predictTool.handler({
            horizon_days: 7,
            yoloMode: true
        });

        expect(result.isError).toBeFalsy();

        const content = JSON.parse(result.content[0].text);
        expect(content.status).toBe("success");
        expect(content.results).toHaveLength(2); // Client A & Client B

        // Verify Client A (Scale Up)
        const clientA = content.results.find((r: any) => r.company === "Client_A");
        expect(clientA).toBeDefined();
        expect(clientA.analysis.recommendation).toBe("scale_up");
        expect(clientA.analysis.confidence_score).toBeGreaterThan(0.8);
        expect(clientA.forecast.model_used).toBe("linear_regression");
        // Verify action was taken
        expect(clientA.actions).toHaveLength(1);
        expect(clientA.actions[0].action).toBe("spawn");
        expect(clientA.actions[0].success).toBe(true);

        // Verify Client B (Scale Down)
        const clientB = content.results.find((r: any) => r.company === "Client_B");
        expect(clientB).toBeDefined();
        expect(clientB.analysis.recommendation).toBe("scale_down");
        expect(clientB.actions).toHaveLength(1);
        expect(clientB.actions[0].action).toBe("scale_down"); // Although action is scale_down, our logic skips actual termination for safety if no ID
        expect(clientB.actions[0].success).toBe(false);
        expect(clientB.actions[0].error).toContain("specific agent_id");
    });

    it("should filter prediction by specific company", async () => {
        const tools = (server as any)._registeredTools || (server as any).registeredTools || (server as any).tools;
        const predictTool = tools["predict_client_demand"];

        const result = await predictTool.handler({
            company: "Client_B",
            horizon_days: 5,
            yoloMode: false
        });

        expect(result.isError).toBeFalsy();
        const content = JSON.parse(result.content[0].text);
        expect(content.results).toHaveLength(1);
        expect(content.results[0].company).toBe("Client_B");
        expect(content.results[0].actions).toHaveLength(0); // YOLO is false
    });
});
