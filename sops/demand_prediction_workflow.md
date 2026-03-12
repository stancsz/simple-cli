# Demand Prediction & Autonomous Resource Allocation Workflow

**Purpose:**
This workflow details the autonomous process for predicting client demand using historical issue tracking and forecasting. It allows the Simple Biosphere to proactively allocate or deallocate Swarm agents, ensuring SLA compliance during high-demand periods and cost-saving resource recovery during low-activity windows.

**Triggers:**
*   Scheduled routinely via the `mcp.json` `scheduledTasks` or the system `crontab` (e.g., daily or weekly evaluations).
*   Can be invoked on-demand by the `business_ops` MCP server via the `predict_client_demand` tool.

**Tools & Integrations:**
*   **MCP Server**: `business_ops` (Tool: `predict_client_demand`)
*   **Forecasting Server**: `forecasting` (Tools: `record_metric`, `forecast_metric`)
*   **Context & Brain**: `EpisodicMemory` (Storing context and logging autonomous actions)
*   **Project Management**: `LinearClient` (Tracking active client issue counts)
*   **Scaling Engine**: `scaling_orchestrator` (Tool: `scale_swarm`)

## Workflow Steps

1.  **Project & Client Discovery**
    *   The `predict_client_demand` tool calls `getActiveProjects()` to proxy active client swarms.
    *   (Optional) The evaluation can be isolated to a single target `company` if specified.

2.  **Telemetry & Signal Gathering**
    *   For each active client, the system queries the Linear API for all non-completed issues.
    *   This count represents the current operational "load."

3.  **Time-Series Metric Recording**
    *   The current issue count is forwarded to the Forecasting MCP (`record_metric`) under the namespace of the client, using the metric `linear_issues`.
    *   This builds the historical database (`forecasting.db`) over time.

4.  **Demand Forecasting**
    *   The system invokes `forecast_metric` via the Forecasting MCP, predicting the `linear_issues` trajectory for the designated `horizon_days` (default 7).
    *   The predictive model returns daily expected loads with statistical confidence intervals.

5.  **Context Synthesis**
    *   The system queries the Brain (`EpisodicMemory`) for recent semantic context regarding the client (e.g., historical blockers, recent escalations, client sentiment).

6.  **AI Analysis & Strategic Recommendation**
    *   The LLM synthesizes the quantitative forecast and qualitative historical context.
    *   Outputs a decision:
        *   `scale_up`: Forecast predicts a surge; allocate more agents.
        *   `scale_down`: Forecast predicts a lull; free up resources.
        *   `maintain`: Demand is stable; keep the current allocation.
    *   Outputs a statistical `confidence_score` (0.0 to 1.0) assessing the reliability of the forecast.

7.  **Autonomous Scaling Execution (`yoloMode`)**
    *   If `yoloMode` is enabled AND the `confidence_score` exceeds the high-confidence threshold (0.8):
        *   The system directly triggers the `scale_swarm` tool in the `scaling_engine`.
        *   Logs the precise action taken.

8.  **Corporate Logging**
    *   All predictions, context, confidence scores, and resulting actions are logged persistently to `EpisodicMemory` flagged as an `autonomous_decision`, creating an audit trail.

## Example Usage (Ghost Mode)
```json
{
  "name": "predict_client_demand",
  "arguments": {
    "horizon_days": 14,
    "yoloMode": true
  }
}
```

This ensures the agency remains perfectly elastic, adapting swarm sizes purely based on empirical forecasting logic.
