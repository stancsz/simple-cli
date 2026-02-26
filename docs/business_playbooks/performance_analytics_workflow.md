# Performance Analytics Workflow

**Objective:**
To autonomously aggregate and analyze key business metrics across Financial (Xero), Operational (Linear), and Client (HubSpot) domains, enabling data-driven optimization of the agency.

## Overview
This workflow utilizes the `analyze_performance_metrics` tool within the `business_ops` MCP server. It is the foundational step of the Quarterly Economic Optimization Cycle.

## Tool: `analyze_performance_metrics`

### Input Parameters
- **`timeframe`**: The period for analysis.
    - `last_month`: Useful for monthly health checks.
    - `last_quarter`: Standard for strategic reviews.
- **`client_id`** (Optional):
    - If provided, filters metrics for a specific client (Project Name in Linear, Company Name in HubSpot).
    - If omitted, aggregates agency-wide performance.

### Data Sources & Logic

#### 1. Financial Health (Xero)
- **Revenue**: Sum of authorized invoices within the timeframe.
- **Expenses**: Sum of authorized bills (Accounts Payable).
- **Profit Margin**: `(Revenue - Expenses) / Revenue`.
- *Fallback*: If Xero connection fails, returns 0 values but logs the error.

#### 2. Operational Efficiency (Linear)
- **Velocity**: Average issues completed per week.
- **Backlog Age**: Average age (in days) of currently open issues.
- **Completion Rate**: Ratio of Completed to (Completed + Open) issues.
- **Efficiency Score (0-100)**: a heuristic score derived from velocity, backlog health, and completion rates.

#### 3. Client Satisfaction (HubSpot)
- **NPS Score**: Aggregates `nps_score` custom property from Company records.
- **Satisfaction Score**: Aggregates `client_satisfaction_score` custom property.
- *Note*: Requires these custom properties to be populated in HubSpot.

#### 4. Brain Integration
- Every execution is automatically stored in Episodic Memory with type `performance_audit`.
- Key: `performance_audit_{timeframe}_{timestamp}`.
- Allows for historical trend analysis by the `framework_optimizer`.

### Output Structure
```json
{
  "timeframe": "last_quarter",
  "financial": {
    "revenue": 150000,
    "profit": 45000,
    "margin": 30,
    "expenses": 105000
  },
  "operational": {
    "velocity": 12.5,
    "backlogAgeDays": 5.2,
    "completionRate": 85,
    "efficiencyScore": 92
  },
  "client": {
    "npsScore": 75,
    "satisfactionScore": 8.5,
    "activeClients": 5
  },
  "overallHealthScore": 88,
  "timestamp": "2024-05-20T10:00:00Z"
}
```

## Strategic Application
1. **Quarterly Review**: Run `analyze_performance_metrics(timeframe='last_quarter')`.
2. **Optimization**: Feed the output into `generate_business_insights` or `adjust_service_offerings`.
3. **Intervention**: If `overallHealthScore` < 70, trigger a `performance_alert`.
