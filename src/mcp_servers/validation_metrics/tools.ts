import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as ss from "simple-statistics";
import { EpisodicMemory } from "../../brain/episodic.js";
import { dirname } from "path";

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

export function evaluate_forecast_accuracy(
  metric_name: string,
  forecasted_values: number[],
  actual_values: number[],
  company: string,
  tolerance: number = 0.1
) {
  if (forecasted_values.length !== actual_values.length) {
    throw new Error("Forecasted and actual values arrays must be of the same length.");
  }
  if (forecasted_values.length === 0) {
      throw new Error("Data arrays must not be empty.");
  }

  const absoluteErrors = [];
  const squaredErrors = [];
  const absolutePercentageErrors = [];

  for (let i = 0; i < actual_values.length; i++) {
    const actual = actual_values[i];
    const forecast = forecasted_values[i];
    const error = Math.abs(actual - forecast);

    absoluteErrors.push(error);
    squaredErrors.push(error * error);

    if (actual !== 0) {
      absolutePercentageErrors.push(error / Math.abs(actual));
    }
  }

  const mae = ss.mean(absoluteErrors);
  const rmse = Math.sqrt(ss.mean(squaredErrors));
  const mape = absolutePercentageErrors.length > 0 ? ss.mean(absolutePercentageErrors) : 0;

  const result = {
    metric_name,
    company,
    tolerance,
    metrics: {
      mae: Number(mae.toFixed(4)),
      rmse: Number(rmse.toFixed(4)),
      mape: Number(mape.toFixed(4)),
    },
    within_tolerance: mape <= tolerance,
    timestamp: new Date().toISOString()
  };

  return result;
}

export function simulate_historical_decision_quality(
    metric_name: string,
    historical_metrics: number[],
    forecasted_metrics: number[],
    actual_metrics: number[],
    company: string
) {
     if (forecasted_metrics.length !== actual_metrics.length) {
         throw new Error("Forecasted and actual values arrays must be of the same length.");
     }
     if (historical_metrics.length === 0 || forecasted_metrics.length === 0) {
         throw new Error("Data arrays must not be empty.");
     }

     const maxActualDemand = Math.max(...actual_metrics);
     const maxPredictedDemand = Math.max(...forecasted_metrics);
     const maxPastDemand = Math.max(...historical_metrics);

     const overprovisioning_forecast = Math.max(0, maxPredictedDemand - maxActualDemand);
     const underprovisioning_forecast = Math.max(0, maxActualDemand - maxPredictedDemand);

     const overprovisioning_naive = Math.max(0, maxPastDemand - maxActualDemand);
     const underprovisioning_naive = Math.max(0, maxActualDemand - maxPastDemand);

     const quality_improvement = {
         underprovisioning_reduction: underprovisioning_naive - underprovisioning_forecast,
         overprovisioning_reduction: overprovisioning_naive - overprovisioning_forecast
     };

     const improvement_score = quality_improvement.underprovisioning_reduction + quality_improvement.overprovisioning_reduction;

     const result = {
         metric_name,
         company,
         decisions: {
             naive_allocation: maxPastDemand,
             forecast_allocation: maxPredictedDemand,
             optimal_allocation: maxActualDemand
         },
         quality_improvement,
         improvement_score,
         timestamp: new Date().toISOString()
     };

     return result;
}

export function registerTools(server: McpServer) {
  server.tool(
    "evaluate_forecast_accuracy",
    "Calculates error metrics (MAE, RMSE, MAPE) against a configurable tolerance for forecasted vs actual metrics.",
    {
      metric_name: z.string().describe("The name of the forecasted metric."),
      forecasted_values: z.array(z.number()).describe("Array of forecasted values."),
      actual_values: z.array(z.number()).describe("Array of actual historical values for the forecast period."),
      company: z.string().describe("Company identifier for context."),
      tolerance: z.number().optional().describe("Acceptable Mean Absolute Percentage Error (MAPE) threshold (e.g. 0.1 for 10%). Defaults to 0.1."),
    },
    async ({ metric_name, forecasted_values, actual_values, company, tolerance }) => {
      try {
        const result = evaluate_forecast_accuracy(metric_name, forecasted_values, actual_values, company, tolerance);

        const validationId = `forecast_validation_${Date.now()}`;
        await episodic.store(
            validationId,
            `Forecast accuracy evaluation for ${metric_name}`,
            JSON.stringify(result),
            ["validation_metrics", "forecast_validation", "accuracy"],
            company,
            undefined,
            false,
            undefined,
            undefined,
            0, 0,
            "forecast_validation"
        );

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error evaluating forecast accuracy: ${error.message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    "simulate_historical_decision_quality",
    "Runs a counterfactual simulation comparing naive vs forecast-informed decisions.",
    {
      metric_name: z.string().describe("The name of the metric representing demand."),
      historical_metrics: z.array(z.number()).describe("Array of historical metrics used as the baseline for naive decisions."),
      forecasted_metrics: z.array(z.number()).describe("Array of forecasted metrics."),
      actual_metrics: z.array(z.number()).describe("Array of actual historical values for the forecast period (representing optimal allocation)."),
      company: z.string().describe("Company identifier for context."),
    },
    async ({ metric_name, historical_metrics, forecasted_metrics, actual_metrics, company }) => {
      try {
        const result = simulate_historical_decision_quality(metric_name, historical_metrics, forecasted_metrics, actual_metrics, company);

        const validationId = `decision_simulation_${Date.now()}`;
        await episodic.store(
            validationId,
            `Historical decision quality simulation for ${metric_name}`,
            JSON.stringify(result),
            ["validation_metrics", "decision_simulation", "quality"],
            company,
            undefined,
            false,
            undefined,
            undefined,
            0, 0,
            "forecast_validation"
        );

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error simulating decision quality: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}
