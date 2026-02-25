import { MCP } from "../../mcp.js";
import { readFile } from "fs/promises";
import { join } from "path";
import { ScalerEngine } from "./scaler_engine.js";

interface Rule {
    metric: string;
    threshold: number;
    action: string;
    agent_template: string;
    count: number;
    cooldown_threshold?: number;
    cooldown_action?: string;
}

export class DemandMonitor {
    private scalerEngine: ScalerEngine;
    private mcp: MCP;
    private rules: Rule[] = [];
    private interval: NodeJS.Timeout | null = null;

    constructor(scalerEngine: ScalerEngine) {
        this.scalerEngine = scalerEngine;
        this.mcp = new MCP();
    }

    async loadRules() {
        const configPath = join(process.cwd(), "config", "elastic_swarm_rules.json");
        try {
            const content = await readFile(configPath, "utf-8");
            this.rules = JSON.parse(content);
        } catch (e) {
            console.error("Failed to load rules:", e);
            this.rules = [];
        }
    }

    async start(intervalMs: number = 60000) {
        await this.loadRules();
        await this.mcp.init();

        this.interval = setInterval(async () => {
            await this.poll();
        }, intervalMs);
    }

    async stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }

    async poll() {
        // Ensure Business Ops is available
        if (!this.mcp.isServerRunning("business_ops")) {
             try {
                 await this.mcp.startServer("business_ops");
             } catch (e) {
                 console.warn("Could not start business_ops, skipping poll:", e);
                 return;
             }
        }

        const client = this.mcp.getClient("business_ops");
        if (!client) {
            console.warn("Business Ops client not connected");
            return;
        }

        for (const rule of this.rules) {
            let value = 0;
            try {
                if (rule.metric === "xero.invoices.pending") {
                    const res: any = await client.callTool({
                        name: "xero_get_invoices",
                        arguments: { statuses: ["DRAFT", "SUBMITTED"] }
                    });

                    if (res.content && res.content[0] && res.content[0].type === 'text') {
                        const invoices = JSON.parse(res.content[0].text);
                        if (Array.isArray(invoices)) {
                            value = invoices.length;
                        }
                    }
                } else if (rule.metric === "linear.issues.bugs") {
                     const res: any = await client.callTool({
                        name: "linear_list_issues",
                        arguments: { state: "Bug" }
                    });
                     if (res.content && res.content[0] && res.content[0].type === 'text') {
                        const issues = JSON.parse(res.content[0].text);
                        if (Array.isArray(issues)) {
                            value = issues.length;
                        }
                    }
                }

                await this.scalerEngine.evaluate(rule, value);
            } catch (e) {
                console.error(`Error processing rule ${rule.metric}:`, e);
            }
        }
    }
}

export let monitorInstance: DemandMonitor | null = null;

export async function startDemandMonitor(scalerEngine: ScalerEngine) {
    monitorInstance = new DemandMonitor(scalerEngine);
    await monitorInstance.start();
}

export async function runScalingCycle() {
    if (monitorInstance) {
        await monitorInstance.poll();
        return "Scaling cycle completed.";
    }
    return "Monitor not initialized.";
}
