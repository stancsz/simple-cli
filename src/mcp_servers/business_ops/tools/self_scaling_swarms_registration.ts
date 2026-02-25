import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { monitor_projects } from "./project_monitor.js";
import { scale_agents_for_project } from "./self_scaling_swarms.js";

export function registerSelfScalingSwarmsTools(server: McpServer) {
    server.tool(
        "monitor_projects",
        "Periodically poll Linear projects and scale agents based on workload.",
        {}, // No arguments
        async () => {
            const result = await monitor_projects();
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );

    server.tool(
        "scale_agents_for_project",
        "Manually trigger scaling for a specific project.",
        {
            projectId: z.string().describe("The Linear Project ID.")
        },
        async ({ projectId }) => {
            const result = await scale_agents_for_project(projectId);
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(result, null, 2)
                }]
            };
        }
    );
}
