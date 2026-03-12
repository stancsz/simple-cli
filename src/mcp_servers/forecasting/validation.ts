import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDb, forecast_metric } from "./models.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { dirname } from "path";
import * as ss from 'simple-statistics';

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);

export function evaluate_forecast_accuracy(metric_name: string, historical_days: number, horizon_days: number, company: string): any {
    const database = getDb();

    // Fetch historical data
    const stmt = database.prepare(`
        SELECT value, timestamp
        FROM metrics
        WHERE metric_name = ? AND company = ?
        ORDER BY timestamp ASC
    `);

    const rows = stmt.all(metric_name, company) as { value: number, timestamp: string }[];

    if (rows.length < historical_days + horizon_days) {
        throw new Error(`Insufficient data to evaluate ${metric_name} for company ${company}. Need at least ${historical_days + horizon_days} data points.`);
    }

    // Split data into training and actuals (testing)
    const trainingData = rows.slice(0, rows.length - horizon_days);
    const actualData = rows.slice(rows.length - horizon_days);

    // Create a temporary mock of forecast_metric input using just the training data
    // In a real implementation, we might want to dependency inject the DB or pass the subset of data to the forecasting model.
    // For this simulation, we'll manually calculate linear regression over the training data subset.
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const dataForRegression: [number, number][] = trainingData.map(row => {
        const ts = new Date(row.timestamp).getTime();
        return [ts / MS_PER_DAY, row.value];
    });

    const regressionLine = ss.linearRegression(dataForRegression);
    const predictor = ss.linearRegressionLine(regressionLine);

    let absoluteErrors = [];
    let absolutePercentageErrors = [];

    for (let i = 0; i < actualData.length; i++) {
        const actualRow = actualData[i];
        const actualValue = actualRow.value;
        const actualTimeMs = new Date(actualRow.timestamp).getTime();
        const predictedValue = predictor(actualTimeMs / MS_PER_DAY);

        const error = Math.abs(actualValue - predictedValue);
        absoluteErrors.push(error);

        if (actualValue !== 0) {
            absolutePercentageErrors.push(error / Math.abs(actualValue));
        }
    }

    const mae = ss.mean(absoluteErrors);
    const mape = absolutePercentageErrors.length > 0 ? ss.mean(absolutePercentageErrors) : 0;

    return {
        metric_name,
        company,
        evaluation_period: {
            training_points: trainingData.length,
            testing_points: actualData.length
        },
        metrics: {
            mae: Number(mae.toFixed(4)),
            mape: Number(mape.toFixed(4))
        }
    };
}

export async function simulate_historical_decisions(metric_name: string, historical_days: number, horizon_days: number, company: string): Promise<any> {
    const database = getDb();

    const stmt = database.prepare(`
        SELECT value, timestamp
        FROM metrics
        WHERE metric_name = ? AND company = ?
        ORDER BY timestamp ASC
    `);

    const rows = stmt.all(metric_name, company) as { value: number, timestamp: string }[];

    if (rows.length < historical_days + horizon_days) {
        throw new Error(`Insufficient data to simulate decisions for ${metric_name}.`);
    }

    const trainingData = rows.slice(0, rows.length - horizon_days);
    const actualData = rows.slice(rows.length - horizon_days);

    // Simulate a past capacity planning decision:
    // Decision 1: Optimal Resource Allocation based on actuals
    const maxActualDemand = Math.max(...actualData.map(r => r.value));

    // Decision 2: Forecast-Informed Resource Allocation
    const MS_PER_DAY = 1000 * 60 * 60 * 24;
    const dataForRegression: [number, number][] = trainingData.map(row => {
        const ts = new Date(row.timestamp).getTime();
        return [ts / MS_PER_DAY, row.value];
    });

    const regressionLine = ss.linearRegression(dataForRegression);
    const predictor = ss.linearRegressionLine(regressionLine);

    const predictedDemands = actualData.map(r => {
        const ts = new Date(r.timestamp).getTime();
        return predictor(ts / MS_PER_DAY);
    });

    const maxPredictedDemand = Math.max(...predictedDemands);

    // We assume a naive allocation would just be the max of the training data
    const maxPastDemand = Math.max(...trainingData.map(r => r.value));

    const overprovisioning_forecast = Math.max(0, maxPredictedDemand - maxActualDemand);
    const underprovisioning_forecast = Math.max(0, maxActualDemand - maxPredictedDemand);

    const overprovisioning_naive = Math.max(0, maxPastDemand - maxActualDemand);
    const underprovisioning_naive = Math.max(0, maxActualDemand - maxPastDemand);

    const quality_improvement = {
        underprovisioning_reduction: underprovisioning_naive - underprovisioning_forecast,
        overprovisioning_reduction: overprovisioning_naive - overprovisioning_forecast
    };

    const simulationResult = {
        metric_name,
        company,
        decisions: {
            naive_allocation: maxPastDemand,
            forecast_allocation: maxPredictedDemand,
            optimal_allocation: maxActualDemand
        },
        quality_improvement
    };

    // Store in Brain Episodic Memory
    const validationId = `forecast_validation_${Date.now()}`;
    await episodic.store(
        validationId,
        `Historical decision simulation for ${metric_name}`,
        JSON.stringify(simulationResult),
        ["forecasting", "validation", "decision_simulation"],
        company,
        undefined,
        false,
        undefined,
        undefined,
        0, 0,
        "autonomous_decision"
    );

    return simulationResult;
}

export function registerValidationTools(server: McpServer) {
    server.tool(
        "evaluate_forecast_accuracy",
        "Computes error metrics (MAE, MAPE) by comparing forecasted values with actual recorded metrics using a historical holdout set.",
        {
            metric_name: z.string().describe("The name of the metric to evaluate."),
            historical_days: z.number().min(2).describe("Number of historical data points to use for training the model."),
            horizon_days: z.number().min(1).describe("Number of future days (actuals) to use as the testing set."),
            company: z.string().describe("The company/client identifier for context."),
        },
        async ({ metric_name, historical_days, horizon_days, company }) => {
            try {
                const result = evaluate_forecast_accuracy(metric_name, historical_days, horizon_days, company);
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
        "simulate_historical_decisions",
        "Simulates past capacity planning decisions using historical forecasts versus optimal resource allocation, returning the quality improvement and logging it to EpisodicMemory.",
        {
            metric_name: z.string().describe("The name of the metric representing demand."),
            historical_days: z.number().min(2).describe("Number of historical data points to use for training the model."),
            horizon_days: z.number().min(1).describe("Number of future days (actuals) to simulate the decision over."),
            company: z.string().describe("The company/client identifier for context."),
        },
        async ({ metric_name, historical_days, horizon_days, company }) => {
            try {
                const result = await simulate_historical_decisions(metric_name, historical_days, horizon_days, company);
                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error simulating historical decisions: ${error.message}` }],
                    isError: true,
                };
            }
        }
    );
}
