import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { simulateScenario, generateForecastReport } from "./forecasting_engine.js";

export function registerTools(server: McpServer) {
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
