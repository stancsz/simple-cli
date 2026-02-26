import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LinearClient } from "@linear/sdk";
import { MCP } from "../../mcp.js";

function getLinearClient() {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
        throw new Error("LINEAR_API_KEY environment variable is not set.");
    }
    return new LinearClient({ apiKey });
}

export function registerScalingTools(server: McpServer, mcpClient?: MCP) {
    const mcp = mcpClient || new MCP();

    server.tool(
        "evaluate_demand",
        "Evaluates the current workload demand for a specific client or project to determine if scaling is needed.",
        {
            project_id: z.string().optional().describe("The Linear project ID to evaluate."),
            client_id: z.string().optional().describe("The client identifier (e.g., from CRM or Brain)."),
            threshold_issues: z.number().optional().default(5).describe("Number of open issues to trigger high demand."),
        },
        async ({ project_id, client_id, threshold_issues }) => {
            const logs: string[] = [];
            let issueCount = 0;
            let recentActivity = "unknown";
            let recommendation = "maintain";

            try {
                // 1. Check Linear Workload
                const linear = getLinearClient();
                if (project_id) {
                    const project = await linear.project(project_id);
                    const issues = await project.issues({
                        filter: { state: { type: { neq: "completed" } } } // Count non-completed issues
                    });
                    issueCount = issues.nodes.length;
                    logs.push(`Found ${issueCount} open issues for project ${project_id}.`);
                } else {
                    // If no project ID, try to find by client_id (assuming client_id matches project name or similar)
                    // For now, if no project_id, we just log a warning.
                    logs.push("No project_id provided, skipping Linear issue count.");
                }

                // 2. Check Brain for Recent Activity (Context)
                try {
                    await mcp.init();
                    const brainClient = mcp.getClient("brain");
                    if (brainClient) {
                         // We use recall to find recent relevant memories
                         // This is a simplification. In a real scenario, we'd query for "recent blockers" or "urgent requests".
                         const query = client_id ? `recent activity for client ${client_id}` : "recent urgent tasks";
                         const memories = await brainClient.callTool({
                             name: "recall_memories",
                             arguments: {
                                 query: query,
                                 limit: 3
                             }
                         });
                         // We don't parse the memories deeply here, just acknowledging we checked.
                         // In a real implementation, we'd analyze sentiment or urgency.
                         logs.push(`Checked Brain for recent activity: ${JSON.stringify(memories).substring(0, 100)}...`);
                         recentActivity = "checked";
                    }
                } catch (e) {
                    logs.push(`Failed to query Brain: ${(e as Error).message}`);
                }

                // 3. Determine Recommendation
                if (issueCount >= threshold_issues) {
                    recommendation = "scale_up";
                } else if (issueCount === 0 && project_id) {
                    recommendation = "scale_down";
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                status: "success",
                                demand_level: issueCount >= threshold_issues ? "high" : "normal",
                                issue_count: issueCount,
                                recommendation,
                                logs
                            }, null, 2)
                        }
                    ]
                };

            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error evaluating demand: ${(error as Error).message}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );

    server.tool(
        "scale_swarm",
        "Spawns or terminates a specialized agent swarm based on demand.",
        {
            client_id: z.string().describe("The client identifier."),
            action: z.enum(["spawn", "terminate"]).describe("The scaling action to perform."),
            role: z.string().optional().describe("The role of the agent to spawn (required for 'spawn')."),
            task: z.string().optional().describe("The initial task for the spawned agent (required for 'spawn')."),
            agent_id: z.string().optional().describe("The agent ID to terminate (required for 'terminate').")
        },
        async ({ client_id, action, role, task, agent_id }) => {
            const logs: string[] = [];
            try {
                await mcp.init();
                const swarmClient = mcp.getClient("swarm-server"); // Assuming swarm server name is "swarm-server"
                // Check if swarm server is available, if not, try "swarm"
                const effectiveSwarmClient = swarmClient || mcp.getClient("swarm");

                if (!effectiveSwarmClient) {
                    throw new Error("Swarm MCP server is not connected.");
                }

                let result;

                if (action === "spawn") {
                    if (!role || !task) {
                        throw new Error("Role and Task are required for spawning.");
                    }
                    logs.push(`Spawning swarm agent '${role}' for client ${client_id}...`);
                    result = await effectiveSwarmClient.callTool({
                        name: "spawn_subagent",
                        arguments: {
                            role,
                            task,
                            parent_agent_id: "scaling-orchestrator",
                            company_id: client_id
                        }
                    });
                } else if (action === "terminate") {
                    if (!agent_id) {
                        throw new Error("Agent ID is required for termination.");
                    }
                    logs.push(`Terminating agent ${agent_id}...`);
                    result = await effectiveSwarmClient.callTool({
                        name: "terminate_agent",
                        arguments: {
                            agent_id
                        }
                    });
                }

                // Log to Brain
                const brainClient = mcp.getClient("brain");
                if (brainClient) {
                    await brainClient.callTool({
                        name: "log_experience",
                        arguments: {
                            taskId: `scaling-${Date.now()}`,
                            task_type: "scale_swarm",
                            agent_used: "scaling-orchestrator",
                            outcome: "success",
                            summary: `Executed ${action} for client ${client_id}. Details: ${JSON.stringify(result)}`,
                            company: client_id
                        }
                    });
                }

                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify({
                                status: "success",
                                action,
                                result,
                                logs
                            }, null, 2)
                        }
                    ]
                };

            } catch (error) {
                 return {
                    content: [
                        {
                            type: "text",
                            text: `Error scaling swarm: ${(error as Error).message}`
                        }
                    ],
                    isError: true
                };
            }
        }
    );
}
