import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { join } from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { getOpenIssueCount } from "./project_management.js";

interface TriggerConfig {
    source: string;
    metric: string;
    threshold: number;
    operator: ">=" | "<=" | ">" | "<" | "==";
}

interface ActionConfig {
    swarm_type: string;
    type: "scale_up" | "scale_down";
    count: number;
    task?: string;
}

interface Rule {
    trigger: TriggerConfig;
    action: ActionConfig;
}

interface Config {
    rules: Rule[];
}

export class SwarmManager {
    private swarmClient: Client | null = null;
    private crmClient: Client | null = null;
    private brainClient: Client | null = null;
    private configPath: string;

    constructor() {
        this.configPath = join(process.cwd(), "config", "elastic_swarms.json");
    }

    private async loadConfig(): Promise<Config> {
        if (!existsSync(this.configPath)) {
            console.warn(`[SwarmManager] Config not found at ${this.configPath}. Using defaults.`);
            return { rules: [] };
        }
        const content = await readFile(this.configPath, "utf-8");
        return JSON.parse(content);
    }

    private async getMetric(source: string, metric: string): Promise<number> {
        // Mock Override (Priority 1)
        const envKey = `MOCK_${source.toUpperCase()}_${metric.toUpperCase()}`;
        if (process.env[envKey]) {
            return Number(process.env[envKey]);
        }

        try {
            // Linear Integration
            if (source === "linear" && metric === "open_issues") {
                if (process.env.LINEAR_API_KEY) {
                    return await getOpenIssueCount();
                } else {
                    console.warn("[SwarmManager] LINEAR_API_KEY missing. Using fallback mock value (20).");
                    return 20;
                }
            }

            // HubSpot Integration
            if (source === "hubspot" && metric === "unread_conversations") {
                if (process.env.HUBSPOT_ACCESS_TOKEN) {
                    if (!this.crmClient) await this.connectToCRM();
                    if (this.crmClient) {
                         const res = await this.crmClient.callTool({ name: "get_unread_conversations", arguments: {} });
                         const val = Number((res as any).content?.[0]?.text);
                         return isNaN(val) ? 0 : val;
                    }
                } else {
                    console.warn("[SwarmManager] HUBSPOT_ACCESS_TOKEN missing. Using fallback mock value (2).");
                    return 2;
                }
            }
        } catch (e) {
            console.error(`[SwarmManager] Failed to get metric ${source}.${metric}:`, e);
            if (source === "hubspot") this.crmClient = null;
        }

        return 0;
    }

    private evaluateCondition(value: number, trigger: TriggerConfig): boolean {
        switch (trigger.operator) {
            case ">=": return value >= trigger.threshold;
            case "<=": return value <= trigger.threshold;
            case ">": return value > trigger.threshold;
            case "<": return value < trigger.threshold;
            case "==": return value === trigger.threshold;
            default: return false;
        }
    }

    async evaluateRules() {
        const config = await this.loadConfig();
        const actionsTaken: string[] = [];

        for (const rule of config.rules) {
            const value = await this.getMetric(rule.trigger.source, rule.trigger.metric);

            if (this.evaluateCondition(value, rule.trigger)) {
                const result = await this.executeScaling(rule.action);
                await this.persistState(rule.action, result);
                actionsTaken.push(`Triggered ${rule.action.type} for ${rule.action.swarm_type}: ${result}`);
            }
        }

        return actionsTaken.length > 0 ? actionsTaken.join("\n") : "No scaling actions needed.";
    }

    async executeScaling(action: ActionConfig) {
        if (!this.swarmClient) {
            await this.connectToSwarm();
        }

        if (!this.swarmClient) {
            return "Failed to connect to Swarm Server.";
        }

        try {
            if (action.type === "scale_up") {
                const results = [];
                for (let i = 0; i < action.count; i++) {
                    const res = await this.swarmClient.callTool({
                        name: "spawn_subagent",
                        arguments: {
                            role: action.swarm_type,
                            task: action.task || "Auto-scaled agent task",
                            parent_agent_id: "swarm-manager",
                            company_id: process.env.JULES_COMPANY
                        }
                    });
                    const text = (res as any).content?.[0]?.text || "Unknown";
                    results.push(text);
                }
                return `Spawned ${action.count} agents. Details: ${results.join(", ")}`;

            } else if (action.type === "scale_down") {
                const listRes = await this.swarmClient.callTool({ name: "list_agents", arguments: {} });
                const listText = (listRes as any).content?.[0]?.text;
                if (!listText) return "Failed to list agents.";

                const agents = JSON.parse(listText);
                const candidates = agents.filter((a: any) => a.role === action.swarm_type);

                let terminated = 0;
                for (let i = 0; i < action.count && i < candidates.length; i++) {
                    const agentId = candidates[i].id;
                     await this.swarmClient.callTool({
                        name: "terminate_agent",
                        arguments: { agent_id: agentId }
                    });
                    terminated++;
                }
                return `Terminated ${terminated} agents of type ${action.swarm_type}.`;
            }
        } catch (e) {
            this.swarmClient = null;
            return `Error executing scaling: ${(e as Error).message}`;
        }
        return "Unknown action type.";
    }

    public async persistState(action: ActionConfig, result: string) {
        if (!this.brainClient) await this.connectToBrain();
        if (this.brainClient) {
            try {
                await this.brainClient.callTool({
                    name: "log_experience",
                    arguments: {
                        taskId: `swarm-scaling-${Date.now()}`,
                        task_type: "swarm_scaling",
                        outcome: "success",
                        summary: `Swarm Manager executed ${action.type} for ${action.swarm_type}. Result: ${result}`,
                        company: process.env.JULES_COMPANY
                    }
                });
            } catch (e) {
                console.error("[SwarmManager] Failed to persist state to Brain:", e);
                this.brainClient = null;
            }
        }
    }

    private async connectToSwarm() {
        try {
            const scriptPath = process.env.SWARM_SERVER_SCRIPT || join(process.cwd(), "src/mcp_servers/swarm/index.ts");
            const transport = new StdioClientTransport({
                command: "npx",
                args: ["tsx", scriptPath],
                env: { ...process.env } as any
            });

            this.swarmClient = new Client(
                { name: "business-ops-swarm-manager", version: "1.0.0" },
                { capabilities: {} }
            );

            await this.swarmClient.connect(transport);
        } catch (e) {
            console.error("Failed to connect to Swarm:", e);
        }
    }

    private async connectToCRM() {
        try {
            const transport = new StdioClientTransport({
                command: "npx",
                args: ["tsx", join(process.cwd(), "src/mcp_servers/crm/index.ts")],
                env: { ...process.env } as any
            });

            this.crmClient = new Client(
                { name: "business-ops-crm-client", version: "1.0.0" },
                { capabilities: {} }
            );

            await this.crmClient.connect(transport);
        } catch (e) {
            console.error("Failed to connect to CRM:", e);
        }
    }

    private async connectToBrain() {
        try {
            const transport = new StdioClientTransport({
                command: "npx",
                args: ["tsx", join(process.cwd(), "src/mcp_servers/brain/index.ts")],
                env: { ...process.env } as any
            });

            this.brainClient = new Client(
                { name: "business-ops-brain-client", version: "1.0.0" },
                { capabilities: {} }
            );

            await this.brainClient.connect(transport);
        } catch (e) {
            console.error("Failed to connect to Brain:", e);
        }
    }
}

export function registerSwarmTools(server: McpServer) {
    const manager = new SwarmManager();

    server.tool(
        "scale_swarm",
        "Manually trigger scaling actions for a specific swarm type.",
        {
            swarm_type: z.string().describe("The type of swarm (e.g., 'triage_agent')."),
            action: z.enum(["scale_up", "scale_down"]).describe("Action to perform."),
            count: z.number().optional().default(1).describe("Number of agents to add/remove.")
        },
        async ({ swarm_type, action, count }) => {
            const config: ActionConfig = {
                swarm_type,
                type: action as "scale_up" | "scale_down",
                count: count
            };

            const result = await manager.executeScaling(config);
            await manager.persistState(config, result); // Persist manual actions too
            return {
                content: [{ type: "text", text: result }]
            };
        }
    );

    server.tool(
        "run_swarm_manager_cycle",
        "Trigger the Swarm Manager to evaluate rules and auto-scale.",
        {},
        async () => {
            const result = await manager.evaluateRules();
            return {
                content: [{ type: "text", text: result }]
            };
        }
    );
}
