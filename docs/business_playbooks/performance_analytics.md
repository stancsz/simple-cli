# Performance Analytics Playbook

## Overview
The `analyze_performance_metrics` tool serves as the data foundation for the Self-Optimizing Economic Engine (Phase 24). It aggregates real-time data from financial, operational, and customer relationship systems to provide a holistic view of agency health.

## Data Sources
- **Xero (Financial):** Revenue, Outstanding Invoices, Profit Margin Proxy.
- **Linear (Efficiency):** Issue Completion Rate, Cycle Time, Backlog Size.
- **HubSpot (Satisfaction):** Deal Win Rate, Customer Satisfaction (NPS/Tickets).

## Tool Usage
The tool is exposed via the `business_ops` MCP server.

**Tool Name:** `analyze_performance_metrics`

**Parameters:**
- `period`: Timeframe for analysis (currently supports `last_30_days`).

**Example Call:**
```json
{
  "name": "analyze_performance_metrics",
  "arguments": {
    "period": "last_30_days"
  }
}
```

## Output Structure
The tool returns a JSON object containing:

```json
{
  "metrics": {
    "period": "last_30_days",
    "financial": {
      "revenue": 50000,
      "outstanding": 5000,
      "profit_margin_proxy": 0.9
    },
    "efficiency": {
      "completion_rate": 0.85,
      "average_cycle_time_days": 4.5,
      "backlog_size": 12
    },
    "satisfaction": {
      "deal_win_rate": 0.4,
      "ticket_volume": 5,
      "nps_score": 75
    },
    "overall_health_score": 82,
    "timestamp": "2023-10-27T10:00:00.000Z"
  },
  "errors": []
}
```

## Integration with Economic Engine
This data is consumed by the `economic_optimization` tools to:
1.  **Optimize Pricing:** Adjust rates based on margin and demand.
2.  **Adjust Services:** Bundle or unbundle offerings based on efficiency and churn.
3.  **Allocate Resources:** Scale swarms based on backlog and win rates.

## Error Handling
The tool uses a "best effort" approach. If one system fails (e.g., API downtime), it logs the error in the `errors` array but returns partial data from other systems to ensure continuity of operations.
