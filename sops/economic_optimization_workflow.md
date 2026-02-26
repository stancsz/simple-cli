# Standard Operating Procedure: Autonomous Economic Optimization

## 1. Overview
This SOP defines the autonomous workflow for optimizing the agency's economic engine. The system analyzes performance metrics, market data, and resource utilization to recommend pricing updates, service adjustments, and swarm allocations.

## 2. Trigger
- **Frequency**: Quarterly (or on-demand).
- **Trigger**: `business_ops` MCP scheduled task.

## 3. Workflow Steps

### Step 1: Data Aggregation
The system aggregates data from all operational pillars:
- **Financial**: Revenue, Profit, Margins (Xero).
- **Delivery**: Velocity, Cycle Time, Efficiency (Linear).
- **Client**: NPS, Churn Risk (HubSpot).
- **Market**: Competitor Pricing, Industry Trends (Market Analysis Tool).

**Tools Used**:
- `analyze_performance_metrics`
- `collect_market_data`

### Step 2: Strategic Analysis
The AI analyzes the aggregated data to identify optimization opportunities.
- **Pricing**: Compare internal costs and margins against market benchmarks.
- **Services**: Identify underperforming or high-potential service bundles.

**Tools Used**:
- `optimize_pricing_strategy`
- `adjust_service_offerings`

### Step 3: Resource Forecasting
Based on client health and projected demand, the system optimizes swarm allocation.
- **High Demand/Value**: Allocate larger swarms (Size 3+).
- **Standard**: Maintain baseline swarms (Size 1-2).
- **Low Demand**: Scale down to monitor mode.

**Tools Used**:
- `allocate_resources_optimally`

### Step 4: Insight Generation & Reporting
The system synthesizes all findings into an executive summary for human review (if not in YOLO mode).

**Tools Used**:
- `generate_business_insights`

## 4. Output
- **Economic Optimization Report**: A comprehensive Markdown report stored in `reports/economic_optimization/`.
- **Action Items**:
    - Proposed Pricing Updates.
    - New Service Bundle Definitions.
    - Swarm Scaling Directives.

## 5. Execution
- **Review**: Human operator reviews the report.
- **Approval**: Upon approval, changes are applied to Xero (Price Lists), Website (Service Offerings), and Swarm Configs (Fleet Management).
