import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getMetricFiles, readNdjson } from "../../health_monitor/utils.js";
import { AnomalyReport } from "../types.js";

export function registerMonitorApiActivityTool(server: McpServer) {
    server.tool(
        "monitor_api_activity",
        "Monitors metric logs from health_monitor for anomalies like spikes in failed auth or errors.",
        {},
        async () => {
            try {
                // Fetch last 7 days of metrics for baseline
                const files = await getMetricFiles(7);
                let allMetrics: any[] = [];
                for (const file of files) {
                    try {
                        allMetrics = allMetrics.concat(await readNdjson(file));
                    } catch (e) {
                        console.warn(`Failed to read metric file ${file}`);
                    }
                }

                if (allMetrics.length === 0) {
                    return {
                        content: [{ type: "text", text: "No metric data found." }]
                    };
                }

                // Group by hour
                const hourlyData: Record<string, { value: number }> = {};
                for (const metric of allMetrics) {
                    if (metric.metric !== "failed_auth" && metric.metric !== "error_count") continue;

                    const date = new Date(metric.timestamp);
                    const hourKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
                    if (!hourlyData[hourKey]) {
                        hourlyData[hourKey] = { value: 0 };
                    }
                    hourlyData[hourKey].value += metric.value;
                }

                // Calculate baseline
                const values = Object.values(hourlyData).map(v => v.value);
                if (values.length < 2) {
                    return {
                        content: [{ type: "text", text: "Not enough historical data to establish baseline." }]
                    };
                }

                const sum = values.reduce((acc, val) => acc + val, 0);
                const average = sum / values.length;
                const variance = values.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / values.length;
                const stdDev = Math.sqrt(variance);

                // Detect anomalies in the most recent hours
                const now = new Date();
                const currentHourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;

                const anomalies: AnomalyReport[] = [];

                if (hourlyData[currentHourKey] && stdDev > 0) {
                    const currentValue = hourlyData[currentHourKey].value;
                    const deviationMultiplier = (currentValue - average) / stdDev;

                    if (currentValue > average + 2 * stdDev) {
                         anomalies.push({
                             metric: "combined_errors",
                             agent: "system",
                             timestamp: new Date().toISOString(),
                             value: currentValue,
                             baselineAverage: average,
                             baselineStdDev: stdDev,
                             deviationMultiplier: deviationMultiplier,
                             isAnomaly: true
                         });
                    }
                }

                return {
                    content: [{ type: "text", text: JSON.stringify({
                        anomalies: anomalies,
                        baseline: { average, stdDev, count: values.length }
                    }, null, 2) }]
                };

            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error monitoring API activity: ${error.message}` }],
                    isError: true
                };
            }
        }
    );
}
