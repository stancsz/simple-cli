import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";
import { createLLM } from "../../../llm.js";

export function registerForecastingIntegrationTools(server: McpServer) {
    server.tool(
        "apply_forecast_to_strategy",
        "Evaluates recent strategic forecasts from the Brain against the current Corporate Strategy, and automatically proposes strategic pivots (e.g., adjusting margins, scaling, or risk_tolerance) based on predictive data.",
        {
            company: z.string().optional().describe("Company context namespace."),
            dry_run: z.boolean().default(true).describe("If true, only evaluates the strategy without making persistent changes via propose_strategic_pivot.")
        },
        async ({ company, dry_run }) => {
            let brainClient: Client | null = null;
            try {
                const srcPath = join(process.cwd(), "src", "mcp_servers", "brain", "index.ts");
                const distPath = join(process.cwd(), "dist", "mcp_servers", "brain", "index.js");

                let command = "node";
                let args = [distPath];

                if (existsSync(srcPath) && !existsSync(distPath)) {
                  command = "npx";
                  args = ["tsx", srcPath];
                } else if (!existsSync(distPath)) {
                  throw new Error(`Brain MCP Server not found at ${srcPath} or ${distPath}`);
                }

                const transport = new StdioClientTransport({ command, args });
                brainClient = new Client({ name: "business_ops-brain-client-forecasting", version: "1.0.0" }, { capabilities: {} });
                await brainClient.connect(transport);

                // 1. Fetch recent strategic forecasts
                const forecastQuery: any = await brainClient.callTool({
                    name: "brain_query",
                    arguments: {
                        query: "Strategic Forecast",
                        limit: 10,
                        format: "json",
                        type: "strategic_forecast",
                        company: company
                    }
                });

                if (forecastQuery.isError || !forecastQuery.content || forecastQuery.content.length === 0) {
                     return { content: [{ type: "text", text: "No recent strategic forecasts found in the Brain. Nothing to apply." }] };
                }

                let parsedForecasts = [];
                try {
                     parsedForecasts = JSON.parse(forecastQuery.content[0].text);
                } catch(e) {
                     return { content: [{ type: "text", text: "Failed to parse strategic forecasts from the Brain." }], isError: true };
                }

                if (parsedForecasts.length === 0) {
                     return { content: [{ type: "text", text: "No recent strategic forecasts found in the Brain. Nothing to apply." }] };
                }

                // 2. Fetch current corporate strategy
                const strategyQuery: any = await brainClient.callTool({
                    name: "read_strategy",
                    arguments: { company }
                });

                let currentStrategy = {};
                if (!strategyQuery.isError && strategyQuery.content && strategyQuery.content.length > 0) {
                    try {
                        currentStrategy = JSON.parse(strategyQuery.content[0].text);
                    } catch(e) {}
                }

                // 3. Use LLM to evaluate the forecast against the strategy and propose a pivot if necessary
                const llm = createLLM();
                const prompt = `You are a Chief Strategy Officer AI.
Your task is to analyze recent strategic forecasting data and the current Corporate Strategy.
Determine if the company's trajectory requires a strategic pivot (e.g., changes to target markets, service margins, risk tolerance, or resource allocation).

Current Corporate Strategy:
${JSON.stringify(currentStrategy, null, 2)}

Recent Strategic Forecasts:
${JSON.stringify(parsedForecasts, null, 2)}

Analyze the forecasts. Are there significant risks, margin erosions, or rapid growth opportunities that require a change in strategy?

If a pivot is needed, propose a clear, comprehensive adjustment to the strategy. Ensure the proposal addresses how to handle the predicted metrics.
If no pivot is needed, state "NO PIVOT REQUIRED" and briefly explain why.`;

                const response = await llm.generate(prompt, []);
                const evaluation = response.message || "";

                if (evaluation.includes("NO PIVOT REQUIRED")) {
                     return { content: [{ type: "text", text: `Forecast evaluated against strategy. No pivot necessary.\n\nDetails: ${evaluation}` }] };
                }

                if (dry_run) {
                     return { content: [{ type: "text", text: `[DRY RUN] Evaluation indicates a strategic pivot is necessary. To apply, run with dry_run=false.\n\nProposed Pivot:\n${evaluation}` }] };
                }

                // 4. Propose the strategic pivot
                const pivotResult: any = await brainClient.callTool({
                    name: "propose_strategic_pivot",
                    arguments: {
                        proposal: evaluation,
                        company: company
                    }
                });

                if (pivotResult.isError) {
                    return { content: [{ type: "text", text: `Failed to propose strategic pivot: ${JSON.stringify(pivotResult.content)}` }], isError: true };
                }

                return { content: [{ type: "text", text: `Successfully evaluated strategic forecast and applied a strategic pivot.\n\nDetails:\n${evaluation}\n\nPivot Result:\n${pivotResult.content[0].text}` }] };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error applying forecast to strategy: ${error.message}` }],
                    isError: true
                };
            } finally {
                if (brainClient) {
                    try { await brainClient.close(); } catch {}
                }
            }
        }
    );
}
