import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { SwarmMetrics, SchedulerState } from "./types.js";

export class ScalingEngine {
    private client: Client;
    private schedulerStateFile: string;
    private running = false;
    private loopInterval: NodeJS.Timeout | null = null;
    private swarmUrl: string;

    constructor(private agentDir: string, swarmUrl?: string) {
        this.schedulerStateFile = join(agentDir, 'scheduler_state.json');
        this.swarmUrl = swarmUrl || 'http://localhost:3005/sse';
        this.client = new Client(
            { name: "elastic-swarm-client", version: "1.0.0" },
            { capabilities: {} }
        );
    }

    async connect() {
        try {
            const transport = new SSEClientTransport(new URL(this.swarmUrl));
            await this.client.connect(transport);
            console.log(`Connected to Swarm at ${this.swarmUrl}`);
        } catch (e) {
            console.error(`Failed to connect to Swarm at ${this.swarmUrl}: ${(e as Error).message}`);
            // Retry logic could be added here
        }
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.loopInterval = setInterval(() => this.tick(), 30000);
        console.log("Scaling Engine started.");
    }

    stop() {
        this.running = false;
        if (this.loopInterval) clearInterval(this.loopInterval);
    }

    async tick() {
        console.log("Scaling tick...");
        try {
            const pendingTasks = await this.getPendingTaskCount();

            let metrics: SwarmMetrics;
            try {
                metrics = await this.getSwarmMetrics();
            } catch (e) {
                // If connection lost, try reconnecting
                console.warn("Failed to get metrics, attempting reconnect...");
                await this.connect();
                metrics = await this.getSwarmMetrics();
            }

            console.log(`Metrics: Pending Tasks: ${pendingTasks}, Active Agents: ${metrics.total_agents}`);

            // Scaling Logic
            // 1. Scale Up
            if (pendingTasks > 5) {
                console.log("Scale Up condition met (Pending > 5). Spawning subagent...");
                await this.spawnAgent();
            }

            // 2. Scale Down
            // Terminate idle agents (> 300s)
            for (const agent of metrics.agents) {
                // Skip agents that might be critical or parentless? No, terminate any worker.
                // Assuming we don't kill persistent/system agents if they are marked specially.
                // For now, simple logic.
                if (agent.idleSeconds > 300) {
                     console.log(`Agent ${agent.id} idle for ${agent.idleSeconds}s. Terminating...`);
                     await this.terminateAgent(agent.id);
                }
            }

        } catch (e) {
            console.error(`Scaling tick failed: ${e}`);
        }
    }

    private async getPendingTaskCount(): Promise<number> {
        if (!existsSync(this.schedulerStateFile)) return 0;
        try {
            const content = await readFile(this.schedulerStateFile, 'utf-8');
            const state: SchedulerState = JSON.parse(content);
            return state.pendingTasks ? state.pendingTasks.length : 0;
        } catch (e) {
            console.error("Failed to read scheduler state:", e);
            return 0;
        }
    }

    private async getSwarmMetrics(): Promise<SwarmMetrics> {
        const result: any = await this.client.callTool({
            name: "get_agent_metrics",
            arguments: {}
        });
        if (result.content && result.content[0]) {
            return JSON.parse(result.content[0].text);
        }
        throw new Error("Invalid metrics response");
    }

    private async spawnAgent() {
        await this.client.callTool({
            name: "spawn_subagent",
            arguments: {
                role: "Worker",
                task: "Help with pending tasks",
                parent_agent_id: "elastic-swarm",
                company_id: process.env.COMPANY || "default"
            }
        });
    }

    private async terminateAgent(agentId: string) {
        await this.client.callTool({
            name: "terminate_agent",
            arguments: {
                agent_id: agentId
            }
        });
    }
}
