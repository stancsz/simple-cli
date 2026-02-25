import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runScalingCycle } from "./demand_monitor.js";
import { ScalerEngine } from "./scaler_engine.js";

export function registerTools(server: McpServer, scalerEngine: ScalerEngine) {
    server.tool(
        "scale_agents",
        "Manually trigger a scaling cycle to check metrics and spawn/terminate agents.",
        {},
        async () => {
            const result = await runScalingCycle();
            return {
                content: [{ type: "text", text: result }]
            };
        }
    );

    server.tool(
        "get_swarm_status",
        "Get the current status of the elastic swarm (active agents per metric).",
        {},
        async () => {
            const status = scalerEngine.getStatus();
            return {
                content: [{ type: "text", text: JSON.stringify(status, null, 2) }]
            };
        }
    );
}
