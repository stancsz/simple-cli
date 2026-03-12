import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createIssue, getProjectIssues } from "../linear_service.js";

export function registerCreateIssue(server: McpServer) {
    server.tool(
        "get_linear_project_issues",
        "Fetch existing issues within a Linear project.",
        {
            projectId: z.string().describe("The Linear Project ID.")
        },
        async ({ projectId }) => {
            try {
                const result = await getProjectIssues(projectId);
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
                        text: `Error fetching issues: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );

    server.tool(
        "create_linear_issue",
        "Create a Linear issue (task) within a project.",
        {
            projectId: z.string().describe("The Linear Project ID."),
            title: z.string().describe("Issue title."),
            description: z.string().optional().describe("Issue description."),
            priority: z.number().optional().describe("Priority (0=No Priority, 1=Urgent, 2=High, 3=Normal, 4=Low).")
        },
        async ({ projectId, title, description, priority }) => {
            try {
                const result = await createIssue(projectId, title, description, priority);
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
                        text: `Error creating issue: ${e.message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
