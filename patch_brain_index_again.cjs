const fs = require('fs');

const indexPath = 'src/mcp_servers/brain/index.ts';
let code = fs.readFileSync(indexPath, 'utf-8');

const importStatement = `import { recordStrategicMetric, queryForecastingInsights } from "./tools/forecasting_integration.js";`;

if (!code.includes('import { recordStrategicMetric')) {
  // Add import
  code = code.replace(
    'import { executeBatchRoutines } from "./tools/efficiency.js";',
    `import { executeBatchRoutines } from "./tools/efficiency.js";\n${importStatement}`
  );
}

const toolRegistrationCode = `
    // Forecasting Integration Tools
    this.server.tool(
      "record_strategic_metric",
      "Stores a forecasting metric in EpisodicMemory with type 'strategic_metric'.",
      {
        metric_name: z.string().describe("The name of the metric (e.g., 'api_cost_trend')."),
        value: z.number().describe("The recorded value of the metric."),
        timestamp: z.string().describe("ISO 8601 timestamp of when the metric was recorded."),
        source: z.string().describe("The source of the metric (e.g., 'forecasting_mcp')."),
        confidence: z.number().describe("Confidence score (0.0 to 1.0) of the metric."),
        company: z.string().optional().describe("The company/client identifier for namespacing context."),
      },
      async ({ metric_name, value, timestamp, source, confidence, company }) => {
        try {
          const result = await recordStrategicMetric(this.episodic, metric_name, value, timestamp, source, confidence, company);
          return {
            content: [{ type: "text", text: \`Successfully recorded strategic metric '\${metric_name}' (Task ID: \${result.taskId}).\` }]
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: \`Error recording strategic metric: \${e.message}\` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      "query_forecasting_insights",
      "Retrieves and synthesizes forecasts for strategic planning, correlating them with the active Corporate Strategy.",
      {
        metrics: z.array(z.string()).describe("List of metric names to forecast and synthesize."),
        horizon_days: z.number().describe("Number of days into the future to forecast."),
        company: z.string().optional().describe("The company/client identifier for context."),
      },
      async ({ metrics, horizon_days, company }) => {
        try {
          const insights = await queryForecastingInsights(this.episodic, metrics, horizon_days, company);
          return {
            content: [{ type: "text", text: JSON.stringify(insights, null, 2) }]
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: \`Error querying forecasting insights: \${e.message}\` }],
            isError: true
          };
        }
      }
    );
`;

if (!code.includes('record_strategic_metric')) {
  code = code.replace(
    '// Semantic Graph Tools',
    `${toolRegistrationCode}\n    // Semantic Graph Tools`
  );
  fs.writeFileSync(indexPath, code);
  console.log('Brain MCP index updated successfully.');
} else {
  console.log('Tools already registered.');
}
