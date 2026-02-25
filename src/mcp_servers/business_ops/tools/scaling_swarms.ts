import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getLinearClient as defaultGetLinearClient } from "../linear_service.js";
import { readFile } from "fs/promises";
import { join } from "path";

// Dependency Injection for Testing
let getLinearClientFn = defaultGetLinearClient;

export function setTestGetLinearClient(fn: any) {
    getLinearClientFn = fn;
}

// Singleton SwarmServer instance to maintain state within business_ops
// Note: In a distributed setup, this would be a separate service.
// Here we host it within business_ops to leverage existing logic.
let swarmServer: any;

export async function getSwarmServer() {
    if (!swarmServer) {
        // Dynamic import to avoid top-level side effects during test if we mock this function
        const { SwarmServer } = await import("../../swarm/index.js");
        swarmServer = new SwarmServer();
    }
    return swarmServer;
}

export function setTestSwarmServer(mock: any) {
    swarmServer = mock;
}

interface ScalingRule {
    metric: string;
    threshold: number;
    action: string;
    agent_template: string;
    count: number;
    cooldown_threshold: number;
    cooldown_action: string;
}

async function loadScalingRules(): Promise<ScalingRule[]> {
    try {
        const configPath = join(process.cwd(), "config", "scaling_rules.json");
        const data = await readFile(configPath, "utf-8");
        return JSON.parse(data);
    } catch (error) {
        console.error("Failed to load scaling rules:", error);
        return [];
    }
}

export function registerScalingSwarmsTools(server: McpServer) {
    server.tool(
        "monitor_workload",
        "Monitors current workload metrics (Linear, etc.) and triggers swarm scaling actions based on rules.",
        {},
        async () => {
            const serverInstance = await getSwarmServer();
            const rules = await loadScalingRules();
            const results: string[] = [];

            let client;
            try {
                client = getLinearClientFn();
            } catch (e) {
                console.warn("Linear Client not available, skipping Linear metrics.");
            }

            for (const rule of rules) {
                if (rule.metric === "linear.issues.bugs" && client) {
                    try {
                        // Count bug issues
                        // This is a simplified query. In production, we'd use more filters.
                        const issues = await client.issues({
                            filter: {
                                labels: {
                                    some: {
                                        name: { eq: "Bug" }
                                    }
                                },
                                state: {
                                    name: { nin: ["Done", "Canceled"] }
                                }
                            }
                        });

                        const count = issues.nodes.length;
                        const agents = Array.from(serverInstance.workerDetails.values() as Iterable<{ role: string }>).filter(d => d.role === rule.agent_template);
                        const activeAgentCount = agents.length;

                        results.push(`Metric ${rule.metric}: ${count} (Threshold: ${rule.threshold})`);

                        if (count >= rule.threshold) {
                            // Scale Up
                            if (activeAgentCount < 5) { // Safety cap
                                const needed = rule.count;
                                results.push(`Scaling up: Spawning ${needed} ${rule.agent_template} agents.`);
                                for (let i = 0; i < needed; i++) {
                                    await serverInstance.spawnSubAgent(
                                        rule.agent_template,
                                        `Handle high load of ${rule.metric} (Count: ${count})`,
                                        "system-monitor"
                                    );
                                }
                            } else {
                                results.push(`Scaling up skipped: Max agent cap (5) reached for ${rule.agent_template}.`);
                            }
                        } else if (count <= rule.cooldown_threshold && activeAgentCount > 0) {
                            // Scale Down - terminate only one agent per cycle to avoid thrashing
                            results.push(`Scaling down: Terminating 1 ${rule.agent_template} agent.`);

                            // Find agents to terminate
                            const agentsToTerminate = Array.from(serverInstance.workerDetails.entries() as Iterable<[string, { role: string }]>)
                                .filter(([_, d]) => d.role === rule.agent_template)
                                .map(([id, _]) => id);

                            if (agentsToTerminate.length > 0) {
                                // Terminate just the first one found
                                await serverInstance.terminateAgent(agentsToTerminate[0]);
                            }
                        }
                    } catch (e: any) {
                        results.push(`Error checking Linear metric: ${e.message}`);
                    }
                }
                // Add more metrics handling as needed (e.g. Xero)
            }

            return {
                content: [{ type: "text", text: results.join("\n") }]
            };
        }
    );

    server.tool(
        "scale_swarm_up",
        "Manually spawn a new sub-agent for the swarm.",
        {
            role: z.string().describe("Role of the agent (e.g., 'coder', 'researcher')."),
            task: z.string().describe("Initial task for the agent."),
            parent_id: z.string().optional().describe("ID of the parent agent.")
        },
        async ({ role, task, parent_id }) => {
            const serverInstance = await getSwarmServer();
            const result = await serverInstance.spawnSubAgent(role, task, parent_id || "manual-trigger");
            return result;
        }
    );

    server.tool(
        "scale_swarm_down",
        "Manually terminate a swarm agent.",
        {
            agent_id: z.string().describe("ID of the agent to terminate.")
        },
        async ({ agent_id }) => {
            const serverInstance = await getSwarmServer();
            const result = await serverInstance.terminateAgent(agent_id);
            return result;
        }
    );

    server.tool(
        "get_swarm_status",
        "Get the current status of the swarm (active agents, roles).",
        {},
        async () => {
            const serverInstance = await getSwarmServer();
            const result = await serverInstance.listAgents();
            return result;
        }
    );
}
