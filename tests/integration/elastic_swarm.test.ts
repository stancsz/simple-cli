import { describe, it, expect, vi, beforeEach } from "vitest";
import { unlink } from "fs/promises";
import { ScalerEngine } from "../../src/mcp_servers/elastic_swarm/scaler_engine.js";
import { startDemandMonitor, runScalingCycle } from "../../src/mcp_servers/elastic_swarm/demand_monitor.js";

// Mock MCP
const mockCallTool = vi.fn();
const mockIsServerRunning = vi.fn().mockReturnValue(true);
const mockGetClient = vi.fn().mockReturnValue({
    callTool: mockCallTool
});
const mockInit = vi.fn().mockResolvedValue(undefined);
const mockStartServer = vi.fn().mockResolvedValue(undefined);

vi.mock("../../src/mcp.js", () => {
    return {
        MCP: vi.fn().mockImplementation(() => {
            return {
                init: mockInit,
                isServerRunning: mockIsServerRunning,
                startServer: mockStartServer,
                getClient: mockGetClient
            };
        })
    };
});

describe("Elastic Swarm Integration", () => {
    let scalerEngine: ScalerEngine;

    beforeEach(async () => {
        vi.clearAllMocks();
        try {
            await unlink(".agent/elastic_swarm_state.json");
        } catch {}
        scalerEngine = new ScalerEngine();
        await scalerEngine.init();
        await startDemandMonitor(scalerEngine);
    });

    it("should spawn billing agents when invoices > 10", async () => {
        // Mock Business Ops response
        mockCallTool.mockImplementation(async (tool: { name: string, arguments: any }) => {
            if (tool.name === "xero_get_invoices") {
                // Return 15 invoices
                const invoices = Array(15).fill({ invoiceID: "123", status: "DRAFT" });
                return {
                    content: [{ type: "text", text: JSON.stringify(invoices) }]
                };
            }
            if (tool.name === "spawn_subagent") {
                return {
                    content: [{ type: "text", text: JSON.stringify({ agent_id: "agent-" + Date.now() + Math.random() }) }]
                };
            }
            if (tool.name === "linear_list_issues") {
                 return { content: [{ type: "text", text: "[]" }] };
            }
            return { content: [] };
        });

        // Trigger scaling
        await runScalingCycle();

        // Verify spawn called
        const spawnCalls = mockCallTool.mock.calls.filter((call: any) => call[0].name === "spawn_subagent");

        // Should spawn 2 agents (based on rule count: 2)
        expect(spawnCalls.length).toBe(2);

        expect(spawnCalls[0][0]).toMatchObject({
            name: "spawn_subagent",
            arguments: expect.objectContaining({
                role: "Billing Agent",
                task: expect.stringContaining("Handle spike in xero.invoices.pending")
            })
        });
    });

    it("should terminate agents when demand normalizes", async () => {
        // 1. High demand -> Spawn
         mockCallTool.mockImplementation(async (tool: { name: string }) => {
            if (tool.name === "xero_get_invoices") return { content: [{ type: "text", text: JSON.stringify(Array(15).fill({})) }] };
            if (tool.name === "spawn_subagent") return { content: [{ type: "text", text: JSON.stringify({ agent_id: "agent-1" }) }] };
             if (tool.name === "linear_list_issues") return { content: [{ type: "text", text: "[]" }] };
            return { content: [] };
        });
        await runScalingCycle();

        // 2. Low demand -> Terminate
         mockCallTool.mockImplementation(async (tool: { name: string }) => {
            if (tool.name === "xero_get_invoices") return { content: [{ type: "text", text: JSON.stringify(Array(2).fill({})) }] }; // 2 < 10
            if (tool.name === "terminate_agent") return { content: [{ type: "text", text: "Terminated" }] };
            if (tool.name === "linear_list_issues") return { content: [{ type: "text", text: "[]" }] };
            return { content: [] };
        });

        await runScalingCycle();

        // Verify terminate called
        const terminateCalls = mockCallTool.mock.calls.filter((call: any) => call[0].name === "terminate_agent");
        expect(terminateCalls.length).toBeGreaterThan(0);
        expect(terminateCalls[0][0]).toMatchObject({
            name: "terminate_agent",
            arguments: expect.objectContaining({ agent_id: "agent-1" })
        });
    });
});
