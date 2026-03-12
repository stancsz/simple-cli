import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateStrategicInitiativesLogic } from "../../src/mcp_servers/brain/tools/strategic_execution.js";
import { EpisodicMemory } from "../../src/brain/episodic.js";
import { MCP } from "../../src/mcp.js";
import { Tool } from "@modelcontextprotocol/sdk/client/index.js";

// Mock the LLM
vi.mock("../../src/llm.js", () => {
    return {
        createLLM: () => ({
            generate: vi.fn().mockResolvedValue({
                message: JSON.stringify({
                    initiatives: [
                        {
                            title: "Launch targeted outreach to 10 enterprise prospects",
                            description: "Increase enterprise clients by targeting specific verticals.",
                            priority: 2
                        }
                    ],
                    rationale: "Current enterprise client count is 5, but the goal is to increase by 20%."
                })
            })
        })
    };
});

describe("Strategic Execution Engine Validation (Phase 25.5)", () => {
    let mockMcp: any;
    let mockMemory: any;

    beforeEach(() => {
        // Mock EpisodicMemory
        mockMemory = {
            store: vi.fn().mockResolvedValue(true)
        };

        // Mock MCP and its tools
        mockMcp = {
            init: vi.fn().mockResolvedValue(true),
            getTools: vi.fn().mockResolvedValue([
                {
                    name: "read_strategy",
                    execute: vi.fn().mockResolvedValue({
                        content: [{
                            text: JSON.stringify({
                                vision: "Become the leading AI agency",
                                objectives: ["Increase enterprise clients by 20%"]
                            })
                        }]
                    })
                },
                {
                    name: "analyze_performance_metrics",
                    execute: vi.fn().mockResolvedValue({
                        content: [{
                            text: JSON.stringify({
                                current_enterprise_clients: 5,
                                revenue_growth: "5%"
                            })
                        }]
                    })
                },
                {
                    name: "get_metrics",
                    execute: vi.fn().mockResolvedValue({
                        content: [{
                            text: JSON.stringify({
                                cpu_usage: "45%",
                                system_health: "Healthy"
                            })
                        }]
                    })
                },
                {
                    name: "get_fleet_status",
                    execute: vi.fn().mockResolvedValue({
                        content: [{
                            text: JSON.stringify([
                                { agent_id: "agent-1", status: "idle" },
                                { agent_id: "agent-2", status: "busy" }
                            ])
                        }]
                    })
                },
                {
                    name: "create_linear_project",
                    execute: vi.fn().mockResolvedValue({
                        content: [{
                            text: JSON.stringify({
                                id: "proj-123",
                                name: "Strategic Initiatives: global",
                                action: "created"
                            })
                        }]
                    })
                },
                {
                    name: "create_linear_issue",
                    execute: vi.fn().mockResolvedValue({
                        content: [{
                            text: JSON.stringify({
                                id: "issue-123",
                                url: "https://linear.app/issue-123",
                                identifier: "STRAT-1",
                                title: "Launch targeted outreach to 10 enterprise prospects"
                            })
                        }]
                    })
                },
                {
                    name: "get_linear_project_issues",
                    execute: vi.fn().mockResolvedValue({
                        content: [{
                            text: JSON.stringify([])
                        }]
                    })
                }
            ])
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should analyze strategic gaps and create Linear issues successfully", async () => {
        const result = await generateStrategicInitiativesLogic(mockMcp, mockMemory, "global");

        // 1. Verify Rationale
        expect(result.rationale).toContain("Current enterprise client count is 5");

        // 2. Verify Initiatives Created
        expect(result.initiatives_created).toHaveLength(1);
        expect(result.initiatives_created[0].title).toBe("Launch targeted outreach to 10 enterprise prospects");
        expect(result.initiatives_created[0].status).toBe("created");
        expect(result.initiatives_created[0].identifier).toBe("STRAT-1");

        // 3. Verify Memory Storage
        expect(mockMemory.store).toHaveBeenCalledTimes(1);
        expect(mockMemory.store).toHaveBeenCalledWith(
            expect.stringContaining("strategic_execution_"),
            expect.stringContaining("Generated initiatives based on gap analysis"),
            expect.any(String), // The JSON string of results
            expect.arrayContaining(["strategic_execution", "linear", "phase_25_5"]),
            "global",
            undefined, false, undefined, undefined, 0, 0,
            "strategic_execution_log"
        );

        // 4. Verify Tool Calls
        const tools = await mockMcp.getTools();

        const readStrategyTool = tools.find((t: any) => t.name === "read_strategy");
        expect(readStrategyTool.execute).toHaveBeenCalled();

        const createProjectTool = tools.find((t: any) => t.name === "create_linear_project");
        expect(createProjectTool.execute).toHaveBeenCalledWith({
            dealId: "global",
            projectName: "Strategic Initiatives: global",
            description: "Auto-generated project for tracking high-level strategic initiatives."
        });

        const createIssueTool = tools.find((t: any) => t.name === "create_linear_issue");
        expect(createIssueTool.execute).toHaveBeenCalledWith({
            projectId: "proj-123",
            title: "Launch targeted outreach to 10 enterprise prospects",
            description: "Increase enterprise clients by targeting specific verticals.\n\n*Auto-generated from Strategic Execution Engine.*",
            priority: 2
        });
    });

    it("should handle missing corporate strategy gracefully", async () => {
        // Override read_strategy to return "No strategy found"
        const readStrategyTool = (await mockMcp.getTools()).find((t: any) => t.name === "read_strategy");
        readStrategyTool.execute.mockResolvedValueOnce({
            content: [{
                text: "No corporate strategy found."
            }]
        });

        await expect(generateStrategicInitiativesLogic(mockMcp, mockMemory, "global")).rejects.toThrow("No active Corporate Strategy found");
    });

    it("should proceed with metric fallbacks if external systems are unavailable", async () => {
        // Make metrics tools fail
        const tools = await mockMcp.getTools();
        const metricsTool = tools.find((t: any) => t.name === "analyze_performance_metrics");
        metricsTool.execute.mockRejectedValueOnce(new Error("API Timeout"));

        const result = await generateStrategicInitiativesLogic(mockMcp, mockMemory, "global");

        // It should still succeed (using the { status: "unavailable" } fallback)
        expect(result.initiatives_created).toHaveLength(1);
    });

    it("should prevent duplicate issue creation (idempotency)", async () => {
        const tools = await mockMcp.getTools();
        const getIssuesTool = tools.find((t: any) => t.name === "get_linear_project_issues");

        // Mock that the issue already exists
        getIssuesTool.execute.mockResolvedValueOnce({
            content: [{
                text: JSON.stringify([
                    { title: "Launch targeted outreach to 10 enterprise prospects" }
                ])
            }]
        });

        const result = await generateStrategicInitiativesLogic(mockMcp, mockMemory, "global");

        // Ensure it is marked as skipped
        expect(result.initiatives_created).toHaveLength(1);
        expect(result.initiatives_created[0].status).toBe("skipped");
        expect(result.initiatives_created[0].reason).toContain("Duplicate issue already exists");

        // Ensure create_linear_issue was NOT called
        const createIssueTool = tools.find((t: any) => t.name === "create_linear_issue");
        expect(createIssueTool.execute).not.toHaveBeenCalled();
    });
});
