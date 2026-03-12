import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { readStrategy } from "./strategy.js";
import { createLLM } from "../../../llm.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";

export async function recordStrategicMetric(
    episodic: EpisodicMemory,
    metric_name: string,
    value: number,
    timestamp: string,
    source: string,
    confidence: number,
    company?: string
) {
    const taskId = `metric_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const request = `Strategic Metric Recorded: ${metric_name}`;
    const solution = JSON.stringify({
        value,
        timestamp,
        source,
        confidence,
    });

    await episodic.store(
        taskId,
        request,
        solution,
        [],
        company,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "strategic_metric"
    );

    return { taskId, metric_name, value, timestamp, source, confidence };
}

export async function queryForecastingInsights(
    episodic: EpisodicMemory,
    metrics: string[],
    horizon_days: number,
    company?: string
) {
    const llm = createLLM();
    const currentStrategy = await readStrategy(episodic, company);

    // Call forecasting server to get forecasts for requested metrics
    const forecasts: Record<string, any> = {};

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
            throw new Error(`Forecasting MCP Server not found at ${srcPath} or ${distPath}`);
        }

        const transport = new StdioClientTransport({ command, args });
        client = new Client({ name: "brain-forecasting-client", version: "1.0.0" }, { capabilities: {} });

        await client.connect(transport);

        for (const metric of metrics) {
            const result: any = await client.callTool({
                name: "forecast_metric",
                arguments: { metric_name: metric, horizon_days, company }
            });

            if (!result.isError && result.content && result.content.length > 0) {
                 forecasts[metric] = JSON.parse(result.content[0].text);
            } else {
                 forecasts[metric] = { error: "Failed to forecast metric", details: result };
            }
        }
    } catch (error: any) {
        throw new Error(`Failed to query forecasting server: ${error.message}`);
    } finally {
        if (client) {
            try { await client.close(); } catch {}
        }
    }

    // Retrieve recent strategic metrics from EpisodicMemory
    const memoryResults = await episodic.recall("Strategic Metric Recorded", 10, company, "strategic_metric");
    const historicalMetrics = memoryResults.map(r => ({
        request: r.userPrompt,
        data: JSON.parse(r.agentResponse)
    }));

    // Generate synthesized report
    const prompt = `
        You are the Chief Strategy Officer AI.
        Synthesize the following forecasting insights and recent metrics with the current Corporate Strategy.

        Current Corporate Strategy:
        ${JSON.stringify(currentStrategy, null, 2)}

        Recent Strategic Metrics (Historical Data):
        ${JSON.stringify(historicalMetrics, null, 2)}

        Forecasted Metrics (Next ${horizon_days} days):
        ${JSON.stringify(forecasts, null, 2)}

        Provide a summarized report outlining strategic implications, risks, and recommendations for the C-Suite personas based on these forecasts.
    `;

    const response = await llm.generate(prompt, []);
    return {
        report: response.message,
        forecasts,
        strategy_context: currentStrategy ? "Applied" : "None"
    };
}
