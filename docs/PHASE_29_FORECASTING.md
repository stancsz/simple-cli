# Phase 29: Forecasting Validation Metrics

## Overview

As part of Phase 29 (Advanced Planning & Forecasting), it is critical to ensure that our time-series forecasting models provide actionable and accurate predictions. To fulfill this, we implemented validation metrics to continuously evaluate forecast accuracy and measure decision quality improvement via historical data simulation.

## Approach

The validation approach is integrated directly into the `forecasting` MCP server through two primary tools:

### 1. `evaluate_forecast_accuracy`
This tool calculates the accuracy of the forecasting models by employing a historical holdout strategy.
- **Methodology**: It divides historical metrics into a training set and a testing set (actuals). The model generates predictions using the training data, which are then compared against the actuals in the testing set.
- **Metrics Calculated**:
  - **MAE (Mean Absolute Error)**: Measures the average magnitude of the errors in a set of predictions, without considering their direction.
    - `MAE = (1/n) * Σ|Actual - Predicted|`
  - **MAPE (Mean Absolute Percentage Error)**: Measures the accuracy as a percentage, which provides a relative understanding of the error margin regardless of the metric's scale.
    - `MAPE = (1/n) * Σ(|Actual - Predicted| / |Actual|)`
- **Targets**: We strictly enforce an MAE of < 10% and a MAPE of < 15% for key resource metrics (e.g., token usage, CPU load) to consider the model reliable.

### 2. `simulate_historical_decisions`
Accurate forecasts are only valuable if they lead to better business and operational decisions. This tool simulates past capacity planning decisions to prove the ROI of the forecasting engine.
- **Methodology**: It compares three scenarios for a given historical period:
  1. **Optimal Allocation**: What we *should* have done, knowing the actual future demand perfectly.
  2. **Naive Allocation**: What we *would* have done using a naive approach (e.g., just provisioning based on the maximum past demand).
  3. **Forecast-Informed Allocation**: What we *did* do by trusting the forecasting model's predictions.
- **Quality Improvement**: By analyzing the delta between these scenarios, the tool calculates the reduction in *Underprovisioning* (which risks SLA breaches) and *Overprovisioning* (which wastes budget).

## Integration with Corporate Strategy & Brain MCP

To support our Recursive Optimization pillar, the results of the `simulate_historical_decisions` tool are autonomously stored in the Corporate Brain (`EpisodicMemory`).

When the `business_ops` MCP server assesses capacity planning or budget allocations, it can recall these validation results. By doing so, the system continuously learns *how much* to trust its own forecasts under varying market conditions, allowing it to dynamically adjust its safety margins and iteratively refine the Corporate Strategy.
