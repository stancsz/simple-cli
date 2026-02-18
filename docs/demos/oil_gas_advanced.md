---
layout: page
title: Oil & Gas Advanced Demo
---

# Advanced Oil & Gas Analyst Demo: Reactive Anomaly Detection

## Overview
This demo showcases the **"Predictive Maintenance"** capabilities of the Oil & Gas agent. The user will provide a CSV file with high-frequency sensor data containing an injected anomaly (e.g., a "gas kick" or pump failure). The agent must:
1.  **Analyze** the time-series using Python (pandas).
2.  **Detect** the anomaly using an Unsupervised Learning model (Isolation Forest).
3.  **Calculate** the lost production volume.
4.  **Generate** an interactive HTML report with Plotly charts.

## Setup Instructions

### 1. Prerequisites
Ensure you have the Python skill dependencies installed:
```bash
pip install pandas scikit-learn plotly
```

### 2. Run the Simulation (CLI)
Navigate to the `demos/oil_gas_advanced` directory.

```powershell
$env:SIMPLE_CLI_SKILL="oil_gas"
cd demos/oil_gas_advanced
# Run the agent
../../bin/simple "Analyze 'data/sensor_readings.csv'. Train an Isolation Forest to detect anomalies in pressure and flow rate. Calculate total potential lost production during anomaly periods. Save an interactive HTML report as 'anomaly_report.html'."
```

### 3. Expected Outcome
The agent will:
*   Read the CSV.
*   Write a Python script `analyze_sensors.py`.
*   Output `anomaly_report.html` containing:
    *   A line chart of Pressure/Flow Rate.
    *   Red markers indicating detected anomalies.
    *   A summary table of lost barrels.

## Why This is Impressive
*   **Machine Learning**: It's not just SQL/Aggregation; it uses `sklearn`.
*   **Interactive Viz**: It produces a standalone HTML file you can open in a browser.
*   **Complex Reasoning**: It correlates "Low Flow + High Vibration" to a specific failure mode.

[Back to Demos](./index.md)
