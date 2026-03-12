import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { randomUUID } from "crypto";
import * as k8s from '@kubernetes/client-node';
import { createLLM } from "../../../llm.js";

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

// Helper to fetch latest policy
async function getLatestPolicy(company: string = "default"): Promise<CorporatePolicy | null> {
    const memories = await episodic.recall("corporate_policy", 10, company, "corporate_policy");
    if (!memories || memories.length === 0) return null;

    const policies = memories
        .map(m => {
            try {
                return JSON.parse(m.agentResponse) as CorporatePolicy;
            } catch {
                return null;
            }
        })
        .filter((p): p is CorporatePolicy => p !== null && p.isActive)
        .sort((a, b) => b.version - a.version);

    return policies.length > 0 ? policies[0] : null;
}

// Helper to run forecasting via MCP client
async function fetchForecast(metric_name: string, horizon_days: number, company: string): Promise<any> {
    let client: Client | null = null;
    try {
        const srcPath = join(process.cwd(), "src", "mcp_servers", "forecasting", "index.ts");
        const distPath = join(process.cwd(), "dist", "mcp_servers", "forecasting", "index.js");

        let command = "node";
        let args = [distPath];

        if (existsSync(srcPath) && !existsSync(distPath)) {
            command = "npx";
            args = ["tsx", srcPath];
        } else if (!existsSync(distPath)) {
            throw new Error(`Forecasting MCP Server not found.`);
        }

        const transport = new StdioClientTransport({ command, args });
        client = new Client({ name: "business_ops-capacity-planner", version: "1.0.0" }, { capabilities: {} });

        await client.connect(transport);

        const result: any = await client.callTool({
            name: "forecast_metric",
            arguments: { metric_name, horizon_days, company }
        });

        if (result.isError) {
            throw new Error(`Forecasting error: ${JSON.stringify(result.content)}`);
        }
        return JSON.parse(result.content[0].text as string);
    } finally {
        if (client) {
            try { await client.close(); } catch {}
        }
    }
}

// Fetch K8s Node Capacity
async function fetchK8sNodes(): Promise<{ count: number, totalCpu: number, totalMemory: number }> {
    try {
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
        const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
        const nodes = await k8sApi.listNode();

        let totalCpu = 0;
        let totalMemory = 0; // In bytes
        const nodeItems = (nodes as any).body?.items || nodes.items;

        for (const node of nodeItems) {
            if (node.status && node.status.capacity) {
                // E.g. "4", "8"
                const cpuStr = node.status.capacity.cpu;
                if (cpuStr) {
                   totalCpu += parseInt(cpuStr.replace(/[^0-9]/g, ''), 10);
                }

                // Memory e.g. "16333912Ki"
                const memStr = node.status.capacity.memory;
                if (memStr) {
                   totalMemory += parseInt(memStr.replace(/[^0-9]/g, ''), 10) * 1024; // Approximation
                }
            }
        }

        return { count: nodeItems.length, totalCpu, totalMemory };
    } catch (e) {
        // Fallback for local environments or test contexts where K8s is not available
        console.warn(`[Capacity Planner] K8s API inaccessible, falling back to default capacity. (${(e as Error).message})`);
        return { count: 3, totalCpu: 100, totalMemory: 64 * 1024 * 1024 * 1024 };
    }
}

export function registerCapacityPlanningTools(server: McpServer) {
    server.tool(
        "propose_capacity_adjustment",
        "Automated capacity planner that analyzes forecasted resource demand against current capacity and policy constraints to recommend infrastructure and token budget scaling.",
        {
            horizon_days: z.number().default(30).describe("Number of days into the future to forecast."),
            cpu_threshold: z.number().default(0.8).describe("CPU utilization threshold (e.g. 0.8 for 80%) to trigger scaling."),
            memory_threshold: z.number().default(0.8).describe("Memory utilization threshold to trigger scaling."),
            company: z.string().optional().describe("The company/client identifier for namespacing."),
            yoloMode: z.boolean().default(false).describe("If true, automatically applies policy changes. Otherwise, outputs recommendations.")
        },
        async ({ horizon_days, cpu_threshold, memory_threshold, company, yoloMode }) => {
            const companyId = company || "default";
            const results: string[] = [];
            const executed_actions: string[] = [];
            let currentPolicy = await getLatestPolicy(companyId);

            // Default token budget if none defined
            const currentTokenBudget = currentPolicy?.parameters?.token_budget || 1000000;

            // Fetch K8s Capacity
            const k8sCapacity = await fetchK8sNodes();

            // Forecast token usage
            let maxTokenUsage = 0;
            try {
                const tokenForecast = await fetchForecast("token_usage", horizon_days, companyId);
                maxTokenUsage = Math.max(...tokenForecast.forecast.map((f: any) => f.predicted_value));
            } catch (e) {
                console.warn("Failed to fetch token_usage forecast", e);
            }

            // Forecast CPU
            let maxCpuUsage = 0;
            try {
                const cpuForecast = await fetchForecast("cpu_usage", horizon_days, companyId);
                maxCpuUsage = Math.max(...cpuForecast.forecast.map((f: any) => f.predicted_value));
            } catch (e) {
                console.warn("Failed to fetch cpu_usage forecast", e);
            }

            // Forecast Memory
            let maxMemoryUsage = 0;
            try {
                const memForecast = await fetchForecast("memory_usage", horizon_days, companyId);
                maxMemoryUsage = Math.max(...memForecast.forecast.map((f: any) => f.predicted_value));
            } catch (e) {
                console.warn("Failed to fetch memory_usage forecast", e);
            }

            // Generate Recommendations via LLM
            let policyUpdatesNeeded = false;
            const newPolicyParams = { ...currentPolicy?.parameters };

            const llm = createLLM();
            const analysisContext = {
                forecasted_demand: {
                    max_token_usage: maxTokenUsage,
                    max_cpu_usage: maxCpuUsage,
                    max_memory_usage: maxMemoryUsage
                },
                current_capacity: {
                    token_budget: currentTokenBudget,
                    k8s_nodes: k8sCapacity.count,
                    k8s_total_cpu: k8sCapacity.totalCpu,
                    k8s_total_memory: k8sCapacity.totalMemory
                },
                thresholds: {
                    cpu_utilization: cpu_threshold,
                    memory_utilization: memory_threshold
                }
            };

            const prompt = `
                You are an expert infrastructure and operations AI. Analyze the forecasted resource demand against the current capacity limits and thresholds.
                Determine whether we need to scale up (increase capacity), scale down/reduce (to save costs for severe under-utilization <40%), or maintain operations.
                Memory is typically in bytes. K8s nodes CPU are raw counts (e.g. 12 = 12 CPUs).

                Context:
                ${JSON.stringify(analysisContext, null, 2)}

                Respond ONLY with a valid JSON array of recommendation objects. No markdown blocks, just the raw JSON.
                Example structure:
                [
                  { "metric": "token_budget", "action": "scale_up", "message": "Forecast max 1500000 exceeds current budget 1000000. Increase token_budget.", "proposed_value": 1800000 },
                  { "metric": "cpu_usage", "action": "maintain", "message": "CPU forecast 10 is within threshold 9.6.", "proposed_value": null },
                  { "metric": "memory_usage", "action": "reduce_nodes", "message": "Memory forecast is very low compared to capacity. Propose reducing K8s nodes.", "proposed_value": null }
                ]
            `;

            let parsedRecommendations: any[] = [];
            try {
                const response = await llm.generate(prompt, []);
                if (response.message) {
                    const rawText = response.message.replace(/```json/g, '').replace(/```/g, '').trim();
                    parsedRecommendations = JSON.parse(rawText);
                } else {
                    throw new Error("LLM response message is undefined");
                }
            } catch (e) {
                console.error("Failed to generate/parse LLM recommendations", e);
                parsedRecommendations = [
                    { metric: "error", action: "maintain", message: "Failed to analyze capacity via LLM. Maintaining current limits." }
                ];
            }

            for (const rec of parsedRecommendations) {
                results.push(`${rec.action}: ${rec.message}`);

                // If token budget needs scaling, auto-update the policy parameter
                if (rec.metric === "token_budget" && (rec.action === "scale_up" || rec.action === "scale_down" || rec.action === "decrease") && rec.proposed_value) {
                    newPolicyParams.token_budget = rec.proposed_value;
                    policyUpdatesNeeded = true;
                }
            }

            // Apply yoloMode
            if (yoloMode) {
                // Log Decision to Brain
                await episodic.store(
                    `capacity_planning_${Date.now()}`,
                    `Automated capacity planning review over ${horizon_days} days.`,
                    JSON.stringify({ recommendations: results, maxCpuUsage, maxTokenUsage, k8sCapacity, tokenBudget: currentTokenBudget }),
                    ["capacity_planning", "infrastructure", "budget"],
                    companyId,
                    undefined,
                    false,
                    undefined,
                    undefined,
                    0, 0,
                    "autonomous_decision"
                );
                executed_actions.push("Logged autonomous_decision to EpisodicMemory.");

                // Update Policy if needed
                if (policyUpdatesNeeded && currentPolicy) {
                    const newVersion = currentPolicy.version + 1;
                    const newPolicy: CorporatePolicy = {
                        ...currentPolicy,
                        id: randomUUID(),
                        version: newVersion,
                        parameters: newPolicyParams as any,
                        previous_version_id: currentPolicy.id,
                        timestamp: Date.now(),
                        description: `Auto-updated by Capacity Planner for horizon ${horizon_days} days.`
                    };

                    await episodic.store(
                        `policy_update_v${newVersion}`,
                        `Capacity planner auto-update policy.`,
                        JSON.stringify(newPolicy),
                        [],
                        companyId,
                        undefined, undefined, undefined,
                        newPolicy.id,
                        0, 0,
                        "corporate_policy"
                    );
                    executed_actions.push(`Updated corporate_policy to version ${newVersion} with new token_budget ${newPolicyParams.token_budget}.`);
                }
            }

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "success",
                        forecast: {
                            maxTokenUsage,
                            maxCpuUsage
                        },
                        capacity: {
                            tokenBudget: currentTokenBudget,
                            k8sNodes: k8sCapacity.count,
                            k8sCpu: k8sCapacity.totalCpu
                        },
                        recommendations: results,
                        executed_actions: yoloMode ? executed_actions : "Dry run mode (yoloMode=false). No actions executed."
                    }, null, 2)
                }]
            };
        }
    );
}
