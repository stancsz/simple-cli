import { MCP } from "../../mcp.js";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

interface Rule {
    metric: string;
    threshold: number;
    action: string;
    agent_template: string;
    count: number;
    cooldown_threshold?: number;
    cooldown_action?: string;
}

export class ScalerEngine {
    private activeAgents: Map<string, string[]> = new Map(); // metric -> agentIds
    private mcp: MCP;
    private statePath = join(process.cwd(), ".agent", "elastic_swarm_state.json");

    constructor() {
        this.mcp = new MCP();
    }

    async init() {
        await this.loadState();
    }

    async loadState() {
        try {
            if (existsSync(this.statePath)) {
                const content = await readFile(this.statePath, "utf-8");
                const rawState = JSON.parse(content);
                this.activeAgents = new Map(Object.entries(rawState));
            }
        } catch (e) {
            console.error("Failed to load state:", e);
        }
    }

    async saveState() {
        try {
            const rawState = Object.fromEntries(this.activeAgents);
            await writeFile(this.statePath, JSON.stringify(rawState, null, 2));
        } catch (e) {
            console.error("Failed to save state:", e);
        }
    }

    async evaluate(rule: Rule, value: number) {
        const key = rule.metric;
        const currentAgents = this.activeAgents.get(key) || [];

        // Check for Scale UP
        if (value > rule.threshold) {
            const desiredCount = rule.count;
            if (currentAgents.length < desiredCount) {
                const needed = desiredCount - currentAgents.length;
                console.log(`[Scaler] Metric ${key} value ${value} > ${rule.threshold}. Spawning ${needed} agents.`);

                // Spawn agents
                for (let i = 0; i < needed; i++) {
                     const agentId = await this.spawnAgent(rule.agent_template, `Handle spike in ${rule.metric}`);
                     if (agentId) {
                         currentAgents.push(agentId);
                     }
                }
                this.activeAgents.set(key, currentAgents);
                await this.saveState();
            }
        }
        // Check for Scale DOWN
        else if (value < (rule.cooldown_threshold || rule.threshold)) {
            if (currentAgents.length > 0) {
                console.log(`[Scaler] Metric ${key} value ${value} normalized. Terminating ${currentAgents.length} agents.`);

                // Terminate agents
                for (const agentId of currentAgents) {
                    await this.terminateAgent(agentId);
                }
                this.activeAgents.set(key, []);
                await this.saveState();
            }
        }
    }

    async ensureSwarmConnected() {
        // Ensure configuration is loaded
        // We can call init repeatedly, it just reloads config.
        await this.mcp.init();

        if (!this.mcp.isServerRunning("swarm")) {
             try {
                await this.mcp.startServer("swarm");
             } catch (e: any) {
                if (!e.message.includes("already running")) {
                    console.error("Failed to start swarm:", e);
                }
             }
        }
    }

    async spawnAgent(templateName: string, task: string): Promise<string | null> {
        // Load template
        const templatePath = join(process.cwd(), "src", "mcp_servers", "elastic_swarm", "templates", `${templateName}.json`);
        let template: any;
        try {
            const content = await readFile(templatePath, "utf-8");
            template = JSON.parse(content);
        } catch (e) {
            console.error(`Failed to load template ${templateName} from ${templatePath}:`, e);
            return null;
        }

        // Call Swarm
        try {
             await this.ensureSwarmConnected();
             const client = this.mcp.getClient("swarm");
             if (!client) {
                 console.error("Swarm client not available");
                 return null;
             }

             const res: any = await client.callTool({
                 name: "spawn_subagent",
                 arguments: {
                     role: template.name,
                     task: task + ". " + template.systemPrompt,
                     parent_agent_id: "elastic-swarm-scaler",
                     company_id: process.env.COMPANY_ID || "elastic-swarm-default"
                 }
             });

             if (res.content && res.content[0] && res.content[0].type === "text") {
                 try {
                    const data = JSON.parse(res.content[0].text);
                    return data.agent_id;
                 } catch (e) {
                     // If response is not JSON, it might be a message
                     console.warn("Could not parse spawn response:", res.content[0].text);
                 }
             }

        } catch (e) {
            console.error("Failed to spawn agent:", e);
        }
        return null;
    }

    async terminateAgent(agentId: string) {
        try {
             await this.ensureSwarmConnected();
             const client = this.mcp.getClient("swarm");
             if (!client) return;

             await client.callTool({
                 name: "terminate_agent",
                 arguments: { agent_id: agentId }
             });
        } catch (e) {
            console.error(`Failed to terminate agent ${agentId}:`, e);
        }
    }

    getStatus() {
        const status: any = {};
        for (const [metric, agents] of this.activeAgents.entries()) {
            status[metric] = agents;
        }
        return status;
    }
}
