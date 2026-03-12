# Forecasting Integration (Phase 29)

As part of Phase 29, the Simple-CLI forecasting system has been fully integrated with both the **Brain** (Corporate Memory) and the **Business Ops** layer. This integration creates a closed-loop system where predictive data directly influences autonomous operational scaling and corporate strategy.

## Architecture & Data Flow

1. **Metric Collection:**
   The `business_ops` or `health_monitor` components routinely record metrics (e.g., CPU, API tokens, margin) to the `forecasting` MCP server using `record_metric`.

2. **Forecasting Generation:**
   The `forecasting` server predicts future trends using `forecast_metric` (via linear regression, expanding confidence bounds over time).

3. **Memory Storage:**
   Through the `store_forecast` tool, forecasts are serialized into JSON and saved to the `brain` MCP server as Episodic Memories of type `strategic_forecast`. These memory records also optionally capture `forecast_horizon` and `error_margin` metadata directly in the LanceDB schema.

4. **Operational Consumption:**
   When the `business_ops` MCP server assesses swarm capacity via the `allocate_resources_optimally` tool, it queries the `brain` for recent strategic forecasts associated with the specific client. This predictive context is injected into the LLM prompt to preemptively adjust scaling rather than merely reacting to real-time status.

5. **Strategic Pivot Engine:**
   The new `apply_forecast_to_strategy` tool runs routinely to cross-reference recent forecasts against the company's active Corporate Strategy. If forecasts indicate significant margin erosion, unprecedented scale, or risk triggers, the system automatically runs a strategic evaluation and triggers `propose_strategic_pivot` to adjust operational rules (e.g., dialing down `risk_tolerance` or increasing `min_margin`).

## Key Modifications

*   **Brain Server (`src/mcp_servers/brain/index.ts`, `src/brain/episodic.ts`):** Added `forecast_horizon` and `error_margin` properties to `brain_store` and the `PastEpisode` interface for more robust forecasting query indexing.
*   **Forecasting Server (`src/mcp_servers/forecasting/tools.ts`):** Implemented the `store_forecast` tool to securely call the Brain and lodge the metrics.
*   **Business Ops Server (`src/mcp_servers/business_ops/tools/resource_allocation.ts`, `src/mcp_servers/business_ops/tools/forecasting_integration.ts`):**
    *   Updated `allocate_resources_optimally` to pull `strategic_forecast` records.
    *   Introduced the `apply_forecast_to_strategy` orchestrator.

## Validation

This entire loop is comprehensively verified in `tests/integration/forecasting_integration.test.ts`. The integration test validates the successful storage of forecasts, accurate context querying, and successful recursive application onto corporate strategy via the LLM.
