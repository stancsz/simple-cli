# Economic Optimization & Resource Allocation

## Overview
This playbook outlines the autonomous workflow for optimizing the agency's economic engine. It leverages the `business_ops` MCP server to analyze performance, allocate resources, and adjust strategies to maximize efficiency and profitability.

## Tools & Capabilities

### 1. Resource Allocation (`allocate_resources_optimally`)
**Purpose**: Predicts demand and recommends optimal swarm allocation across the client fleet.
- **Inputs**: Aggregates data from Linear (backlog), Performance Analytics (revenue/efficiency), and Swarm Fleet status.
- **Logic**: Uses LLM reasoning to balance current workload against predicted demand.
- **Output**: Structured recommendations to `scale_up`, `scale_down`, or `maintain` agent counts per client, with justification.
- **Usage**: Run weekly or on-demand when backlog spikes are detected.

### 2. Performance Analytics (`analyze_performance_metrics`)
**Purpose**: Provides a holistic view of agency health.
- **Metrics**:
  - **Financial**: Revenue, Margin, Outstanding Invoices (Xero).
  - **Delivery**: Velocity, Cycle Time, Efficiency (Linear).
  - **Client**: NPS, Churn Risk (HubSpot).

### 3. Pricing Optimization (`optimize_pricing_strategy`)
**Purpose**: Aligns pricing with market value and internal costs.
- **Logic**: Analyzes competitor pricing (Market Analysis) and internal margins to suggest rate adjustments.

### 4. Market Analysis (`collect_market_data`)
**Purpose**: Gathers external intelligence.
- **Scope**: Competitor pricing, service trends, and demand signals.

## Workflow

1. **Data Collection**:
   - `analyze_performance_metrics` runs to snapshot current health.
   - `collect_market_data` refreshes external benchmarks.

2. **Analysis & Strategy**:
   - `allocate_resources_optimally` determines if current swarms are right-sized.
   - `optimize_pricing_strategy` checks if rates need adjustment based on margins.

3. **Execution**:
   - Validated allocation plans are passed to the `Scaling Engine`.
   - Pricing changes are proposed for human review or automated update in Xero/HubSpot (if enabled).

## Success Metrics
- **Utilization Rate**: Target > 85% across all swarms.
- **Margin**: Target > 30% per client.
- **SLA Compliance**: 100% adherence to delivery timelines.
