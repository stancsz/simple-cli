import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createProject } from "../linear_service.js";

export function registerCreateProject(server: McpServer) {
    server.tool(
        "create_linear_project",
        "Create a Linear project linked to a company/deal.",
        {
            dealId: z.string().describe("HubSpot Deal ID."),
            projectName: z.string().describe("Name of the project."),
            description: z.string().describe("Description of the project."),
            teamId: z.string().optional().describe("Linear Team ID.")
        },
        async ({ dealId, projectName, description, teamId }) => {
            try {
                const result = await createProject(dealId, projectName, description, teamId);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify(result, null, 2)
                    }]
                };
            } catch (e: any) {
                return {
                    content: [{
                        type: "text",
                        text: `Error creating project: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
