import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { simulateScenario, generateForecastReport } from "./forecasting_engine.js";
import { record_metric, forecast_metric } from "./models.js";
import { registerValidationTools } from "./validation.js";
import { evaluate_forecast_accuracy } from "../validation_metrics/tools.js";
import { getDb } from "./models.js";

export function registerTools(server: McpServer) {
  registerValidationTools(server);
  server.tool(
    "record_metric",
    "Records a historical metric value (token usage, API costs, infrastructure load) for time-series forecasting.",
    {
      metric_name: z.string().describe("The name of the metric (e.g., 'llm_token_usage', 'api_latency')."),
      value: z.number().describe("The recorded value of the metric."),
      timestamp: z.string().describe("ISO 8601 timestamp of when the metric was recorded."),
      company: z.string().describe("The company/client identifier for namespacing context."),
    },
    async ({ metric_name, value, timestamp, company }) => {
      try {
        const success = record_metric(metric_name, value, timestamp, company);
        if (success) {
          return {
            content: [{ type: "text", text: `Successfully recorded metric '${metric_name}' with value ${value}.` }],
          };
        } else {
          return {
            content: [{ type: "text", text: `Failed to record metric '${metric_name}'.` }],
            isError: true,
          };
        }
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error recording metric: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "forecast_metric",
    "Forecasts a resource consumption metric (e.g., token usage, API costs) for a given number of days into the future.",
    {
      metric_name: z.string().describe("The name of the metric to forecast."),
      horizon_days: z.number().min(1).max(365).describe("Number of days into the future to forecast."),
      company: z.string().describe("The company/client identifier for context."),
    },
    async ({ metric_name, horizon_days, company }) => {
      try {
        const result = forecast_metric(metric_name, horizon_days, company);

        // Evaluate forecast accuracy if historical data is available
        try {
            const db = getDb();
            const stmt = db.prepare("SELECT value FROM metrics WHERE metric_name = ? AND company = ? ORDER BY timestamp ASC");
            const rows = stmt.all(metric_name, company) as any[];

            if (rows.length >= horizon_days * 2) {
                // simple split for validation
                const actual_values = rows.slice(rows.length - horizon_days).map(r => r.value);
                const forecasted_values = result.forecast.map(f => f.predicted_value);
                // Call validation metrics evaluate_forecast_accuracy
                evaluate_forecast_accuracy(metric_name, forecasted_values, actual_values, company);
            }
        } catch (err) {
            console.error("Non-fatal error running post-forecast accuracy validation:", err);
        }
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error forecasting metric: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
  server.tool(
    "simulate_scenario",
    "Runs a deterministic forecasting simulation using current strategy and historical metrics, adjusting them via provided levers.",
    {
      pricingMultiplier: z.number().optional().describe("Multiplier for pricing (e.g., 1.1 for 10% increase). Defaults to 1.0."),
      marketDemandMultiplier: z.number().optional().describe("Multiplier for market demand (e.g., 0.9 for 10% decrease). Defaults to 1.0."),
      newServiceMultiplier: z.number().optional().describe("Multiplier for new service offerings adding to revenue (e.g., 1.2). Defaults to 1.0."),
      costMultiplier: z.number().optional().describe("Multiplier for base costs (e.g., 1.05 for 5% inflation). Defaults to 1.0."),
      monthsToForecast: z.number().optional().describe("Number of months to forecast. Defaults to 12."),
      company: z.string().optional().describe("The company/client identifier for namespacing context."),
    },
    async ({ pricingMultiplier, marketDemandMultiplier, newServiceMultiplier, costMultiplier, monthsToForecast, company }) => {
      try {
        const result = await simulateScenario({
          pricingMultiplier: pricingMultiplier ?? 1.0,
          marketDemandMultiplier: marketDemandMultiplier ?? 1.0,
          newServiceMultiplier: newServiceMultiplier ?? 1.0,
          costMultiplier: costMultiplier ?? 1.0,
          monthsToForecast: monthsToForecast ?? 12,
          company,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error simulating scenario: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "generate_forecast_report",
    "Generates a narrative forecast summary report utilizing an LLM, based on the outputs from a simulated scenario.",
    {
      simulationData: z.string().describe("JSON stringified output from simulate_scenario."),
      company: z.string().optional().describe("The company/client identifier for context."),
    },
    async ({ simulationData, company }) => {
      try {
        const parsedData = JSON.parse(simulationData);
        const report = await generateForecastReport(parsedData, company);

        return {
          content: [{ type: "text", text: report }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error generating forecast report: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
