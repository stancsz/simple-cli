import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getActiveProjects } from "./swarm_fleet_management.js";
import { scaleSwarmLogic } from "../../scaling_engine/scaling_orchestrator.js";
import { MCP } from "../../../mcp.js";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join, dirname } from "path";
import { existsSync } from "fs";

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

// Helper to run forecasting tools via MCP client
async function callForecastingMCP(toolName: string, argsObj: any): Promise<any> {
    let client: Client | null = null;
    try {
        const srcPath = join(process.cwd(), "src", "mcp_servers", "forecasting", "index.ts");
        const distPath = join(process.cwd(), "dist", "mcp_servers", "forecasting", "index.js");

        let command = "node";
        let args = [distPath];

        if (existsSync(srcPath) && !existsSync(distPath)) {
            command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
            args = ["tsx", srcPath];
        } else if (!existsSync(distPath)) {
            throw new Error(`Forecasting MCP Server not found.`);
        }

        const transport = new StdioClientTransport({ command, args });
        client = new Client({ name: "business_ops-demand-predictor", version: "1.0.0" }, { capabilities: {} });

        await client.connect(transport);

        const result: any = await client.callTool({
            name: toolName,
            arguments: argsObj
        });

        if (result.isError) {
            throw new Error(`Forecasting error: ${JSON.stringify(result.content)}`);
        }

        // record_metric returns text like "Successfully recorded..."
        if (toolName === 'record_metric') {
           return result.content[0].text;
        }

        // forecast_metric returns JSON string
        return JSON.parse(result.content[0].text as string);
    } finally {
        if (client) {
            try { await client.close(); } catch {}
        }
    }
}

export function registerDemandPredictionTools(server: McpServer, mcpClient?: MCP) {
    const mcp = mcpClient || new MCP();

    server.tool(
        "predict_client_demand",
        "Predicts client demand (Linear issues) using the Forecasting MCP and statistical models to automatically scale swarms and allocate resources.",
        {
            company: z.string().optional().describe("Specific company to predict demand for. If omitted, predicts for all active clients."),
            horizon_days: z.number().default(7).describe("Number of days into the future to forecast."),
            yoloMode: z.boolean().default(false).describe("If true, automatically triggers scaling actions when confidence is high.")
        },
        async ({ company, horizon_days, yoloMode }) => {
            const logs: string[] = [];
            const results: any[] = [];

            try {
                // 1. Get Active Projects (Clients)
                let projects = await getActiveProjects();

                if (company) {
                    projects = projects.filter(p => p.name === company);
                    if (projects.length === 0) {
                        return {
                            content: [{ type: "text", text: `No active projects found for company: ${company}` }],
                            isError: true
                        };
                    }
                }

                const llm = createLLM();
                (llm as any).disableRouting = true;

                for (const project of projects) {
                    const clientName = project.name;
                    logs.push(`Analyzing demand for ${clientName}...`);

                    // 2. Gather Current Signals (Linear Issues)
                    const issues = await project.issues({
                        filter: { state: { type: { neq: "completed" } } }
                    });
                    const currentIssuesCount = issues.nodes.length;

                    // 3. Record Metric via Forecasting MCP
                    try {
                        await callForecastingMCP("record_metric", {
                            metric_name: "linear_issues",
                            value: currentIssuesCount,
                            timestamp: new Date().toISOString(),
                            company: clientName
                        });
                        logs.push(`Recorded ${currentIssuesCount} linear_issues for ${clientName}.`);
                    } catch (e) {
                         logs.push(`Failed to record metric for ${clientName}: ${(e as Error).message}`);
                         // We might still be able to forecast if historical data exists
                    }

                    // 4. Forecast Demand
                    let forecastData = null;
                    try {
                        forecastData = await callForecastingMCP("forecast_metric", {
                             metric_name: "linear_issues",
                             horizon_days,
                             company: clientName
                        });
                        logs.push(`Retrieved forecast for ${clientName}.`);
                    } catch (e) {
                        logs.push(`Failed to forecast metric for ${clientName}: ${(e as Error).message}`);
                        results.push({
                            company: clientName,
                            status: "error",
                            message: "Insufficient historical data to generate forecast."
                        });
                        continue;
                    }

                    // 5. Gather Historical Context (Brain)
                    let historicalContext: string[] = [];
                    try {
                        const memories = await episodic.recall(`demand trends issues problems`, 5, clientName);
                        historicalContext = memories.map(m => m.agentResponse);
                    } catch (e) {
                        logs.push(`Failed to query brain for ${clientName}: ${(e as Error).message}`);
                    }

                    // 6. LLM Analysis & Recommendation
                    const analysisContext = {
                        clientName,
                        currentIssuesCount,
                        forecast: forecastData,
                        historicalContext
                    };

                    const prompt = `
                        You are a Business Operations AI predicting client demand and scaling needs.
                        Analyze the historical context and the time-series forecast for Linear issues.

                        Context:
                        ${JSON.stringify(analysisContext, null, 2)}

                        Determine if we need to 'scale_up', 'scale_down', or 'maintain' swarm resources for this client.
                        Also provide a 'confidence_score' between 0.0 and 1.0 based on the forecast's confidence (R-squared) and issue trajectory.
                        If the forecast predicts a sharp increase or the upper bound is high, recommend 'scale_up'.
                        If forecast predicts near zero, recommend 'scale_down'.

                        Respond ONLY with a valid JSON object. No markdown blocks.
                        Format:
                        {
                            "recommendation": "scale_up" | "scale_down" | "maintain",
                            "confidence_score": 0.9,
                            "reasoning": "Brief explanation."
                        }
                    `;

                    let recommendationData = { recommendation: "maintain", confidence_score: 0, reasoning: "Fallback." };
                    try {
                        const response = await llm.generate(prompt, []);
                        const rawText = (response.message || response.raw).replace(/```json/g, '').replace(/```/g, '').trim();
                        recommendationData = JSON.parse(rawText);
                    } catch (e) {
                        logs.push(`Failed to generate LLM recommendation for ${clientName}: ${(e as Error).message}`);
                    }

                    const resultEntry: any = {
                         company: clientName,
                         forecast: forecastData,
                         analysis: recommendationData,
                         actions: []
                    };

                    // 7. Auto-Scaling Action
                    if (yoloMode && recommendationData.confidence_score > 0.8) {
                        if (recommendationData.recommendation === "scale_up") {
                            logs.push(`High confidence scale_up triggered for ${clientName}.`);
                            try {
                                const actionResult = await scaleSwarmLogic(mcp, clientName, "spawn", "specialist", "Handle forecasted demand surge.");
                                resultEntry.actions.push({ action: "spawn", success: true, detail: actionResult });
                            } catch (e) {
                                resultEntry.actions.push({ action: "spawn", success: false, error: (e as Error).message });
                            }
                        } else if (recommendationData.recommendation === "scale_down") {
                            logs.push(`High confidence scale_down triggered for ${clientName}. (Requires agent ID, skipping concrete action for safety)`);
                            resultEntry.actions.push({ action: "scale_down", success: false, error: "Requires specific agent_id to terminate." });
                        }
                    } else if (yoloMode) {
                        logs.push(`Confidence score ${recommendationData.confidence_score} too low for auto-scaling ${clientName}.`);
                    }

                    // Log decision to Episodic Memory
                    await episodic.store(
                        `demand_prediction_${clientName}_${Date.now()}`,
                        `Predicted demand for ${clientName} over ${horizon_days} days.`,
                        JSON.stringify(resultEntry),
                        ["demand_prediction", "forecasting", "scaling"],
                        clientName,
                        undefined, false, undefined, undefined, 0, 0,
                        "autonomous_decision"
                    );

                    results.push(resultEntry);
                }

                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            status: "success",
                            results,
                            logs
                        }, null, 2)
                    }]
                };

            } catch (error) {
                return {
                    content: [{
                        type: "text",
                        text: `Error predicting client demand: ${(error as Error).message}`
                    }],
                    isError: true
                };
            }
        }
    );
}
