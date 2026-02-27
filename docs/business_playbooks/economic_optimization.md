# Economic Optimization Playbook

## Overview
This playbook defines the autonomous process for optimizing the agency's economic engine. The system analyzes performance metrics, market data, and resource utilization to recommend pricing updates, service adjustments, and swarm allocations.

## Tools

### 1. `analyze_performance_metrics`
- **Purpose**: Aggregates internal data from Xero (financial), Linear (delivery), and HubSpot (client satisfaction).
- **Usage**: Called quarterly to establish a performance baseline.

### 2. `collect_market_data` & `analyze_competitor_pricing`
- **Purpose**: Gathers external context on market growth, rates, and competitor offerings.
- **Usage**: Provides the "outside-in" perspective for strategic decisions.

### 3. `optimize_pricing_strategy`
- **Purpose**: Recommends pricing adjustments based on internal costs and external benchmarks.
- **Usage**: Ensures profitability and competitiveness.

### 4. `adjust_service_offerings`
- **Purpose**: Recommends new or modified service bundles.
- **Logic**:
  - Analyzes high-margin vs. low-margin services.
  - Correlates delivery efficiency with client demand.
  - Identifies gaps in current offerings compared to market trends.
  - Uses `EpisodicMemory` to replicate successful project patterns.
- **Output**: Structured recommendations for new bundles, including pricing and target profiles.

### 5. `allocate_resources_optimally`
- **Purpose**: Aligns swarm capacity with projected client demand using predictive analysis.
- **Logic**:
  - Aggregates **Fleet Status** (Active agents, health, pending issues) via `get_fleet_status`.
  - Aggregates **Performance Metrics** (Revenue, efficiency, NPS) via `analyze_performance_metrics`.
  - Uses LLM to analyze the context and recommend scaling actions (Scale Up, Scale Down, Maintain, Reallocate).
  - Can operate in `dry_run` mode (recommendation only) or execute scaling via `scale_swarm`.
- **Inputs**:
  - `dry_run`: (boolean) Default `true`. If `false`, executes scaling.
  - `focus_clients`: (optional array) List of client IDs to restrict analysis.
- **Outputs**:
  - Structured JSON with recommendations, confidence scores, and reasoning.
  - Execution logs if actions were taken.
- **Usage**: Prevents over-provisioning and bottlenecks.

## Optimization Workflow

1. **Data Collection**: Trigger `analyze_performance_metrics` and `collect_market_data`.
2. **Strategy Generation**: Run `optimize_pricing_strategy` and `adjust_service_offerings`.
3. **Resource Alignment**: Run `allocate_resources_optimally`.
4. **Execution**:
   - Update Xero price lists.
   - Update website service descriptions.
   - Adjust swarm configurations in Fleet Management.
