import { describe, it, expect, beforeEach, vi } from "vitest";
import { evaluate_forecast_accuracy, simulate_historical_decision_quality } from "../../src/mcp_servers/validation_metrics/tools.js";
import { forecast_metric, record_metric, _resetDb } from "../../src/mcp_servers/forecasting/models.js";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";

describe("Phase 29: Validation Metrics Integration", () => {
    const testCompany = "validation-tenant-1";
    const testMetric = "api_calls";

    beforeEach(() => {
        _resetDb();
        const dbPath = join(process.cwd(), '.agent', 'data', 'forecasting.db');
        if (existsSync(dbPath)) {
           unlinkSync(dbPath);
        }
    });

    it("should evaluate forecast accuracy and verify it is within tolerance", () => {
        // 1. Mock historical metric data
        const baseDateMs = new Date("2023-01-01T00:00:00Z").getTime();
        const msPerDay = 1000 * 60 * 60 * 24;
        const totalDays = 30;
        const historicalValues = [];

        // Generate 30 days of mock token usage (y = 5x + 100)
        for (let i = 0; i < totalDays; i++) {
            const value = 100 + (5 * i);
            historicalValues.push(value);
            record_metric(testMetric, value, new Date(baseDateMs + (i * msPerDay)).toISOString(), testCompany);
        }

        // 2. Call forecast_metric from forecasting MCP
        // Predict the next 5 days
        const horizon = 5;
        const forecastResult = forecast_metric(testMetric, horizon, testCompany);

        const forecastedValues = forecastResult.forecast.map((f: any) => f.predicted_value);

        // 3. Generate "actual" values for the future 5 days (assume perfect continuation of the trend y = 5x + 100)
        const actualValues = [];
        for (let i = totalDays; i < totalDays + horizon; i++) {
            actualValues.push(100 + (5 * i));
        }

        // 4. Validate the forecast via evaluate_forecast_accuracy
        const accuracyResult = evaluate_forecast_accuracy(testMetric, forecastedValues, actualValues, testCompany, 0.05);

        console.log(`Accuracy Metrics for ${testMetric}:\n`, JSON.stringify(accuracyResult.metrics, null, 2));

        // Assert error metrics are within tolerance
        expect(accuracyResult.within_tolerance).toBe(true);
        expect(accuracyResult.metrics.mape).toBeLessThanOrEqual(0.05);
        expect(accuracyResult.metrics.mae).toBeGreaterThanOrEqual(0);
        expect(accuracyResult.metrics.rmse).toBeGreaterThanOrEqual(0);
    });

    it("should run historical decision quality simulation and verify positive improvement score", () => {
        // Assume historical metrics max is 245
        const historicalMetrics = [100, 150, 200, 245];

        // Assume forecasted max is 265
        const forecastedMetrics = [250, 255, 260, 265];

        // Assume actual max is 270
        const actualMetrics = [250, 260, 265, 270];

        const simulationResult = simulate_historical_decision_quality(
            testMetric,
            historicalMetrics,
            forecastedMetrics,
            actualMetrics,
            testCompany
        );

        console.log(`Simulation Improvements for ${testMetric}:\n`, JSON.stringify(simulationResult.quality_improvement, null, 2));
        console.log(`Total Improvement Score: ${simulationResult.improvement_score}`);

        // 5. Assert that improvement score is positive
        expect(simulationResult.improvement_score).toBeGreaterThan(0);

        // Naive allocation uses max past demand (245). Actual max is 270. Underprovisioning = 25.
        // Forecast allocation uses max predicted (265). Actual max is 270. Underprovisioning = 5.
        // Underprovisioning reduction = 25 - 5 = 20.
        expect(simulationResult.quality_improvement.underprovisioning_reduction).toBe(20);
    });
});
