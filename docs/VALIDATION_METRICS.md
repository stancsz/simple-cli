# Phase 29: Forecasting Validation Metrics

The `validation_metrics` MCP server provides the core quality gate for the time-series forecasting engine. It operates by validating that forecasted values match actuals within a specified tolerance, and measuring the exact "decision quality improvement" of utilizing the forecasting system versus a naive historical maximum allocation.

## Tools
- `evaluate_forecast_accuracy`: Calculates MAE, RMSE, and MAPE between a set of forecasted and actual values. Checks if MAPE is below a configurable tolerance (default `10%`).
- `simulate_historical_decision_quality`: Performs a counterfactual scenario analysis on resource allocation. It calculates:
  - **Optimal Allocation:** The exact actual max required capacity.
  - **Naive Allocation:** The max capacity observed in historical training data.
  - **Forecast Allocation:** The max capacity predicted by the forecast.
  - **Improvement Score:** The total reduction in both overprovisioning and underprovisioning.

## Testing
Validation is tested thoroughly in `tests/integration/validation_metrics_validation.test.ts`, asserting that a simulated linear trend is captured by the model with high confidence (`mape < 5%`) and that the decision simulation significantly reduces underprovisioning compared to a naive model.
