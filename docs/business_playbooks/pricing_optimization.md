# Pricing Optimization Workflow

## Overview
The Pricing Optimization workflow leverages the `optimize_pricing_strategy` tool to provide autonomous, data-driven recommendations for service pricing. By analyzing internal performance metrics (financial, delivery efficiency, client satisfaction) alongside external market data, the system ensures competitive and profitable pricing models.

## Workflow Triggers
- **Quarterly Business Review:** Automated trigger via `economic_optimization_workflow`.
- **Manual Invocation:** Ad-hoc analysis when launching new services or reacting to market shifts.

## Tool: `optimize_pricing_strategy`

### Inputs
- `current_services`: A list of services with their current pricing models.
  - `name`: Service name (e.g., "React Development").
  - `current_price`: Hourly rate or fixed price.
  - `cost`: (Optional) Internal cost basis.

### Data Sources
1.  **Xero:** Analyzes revenue trends and invoice payment status (Last 30 Days).
2.  **Linear:** Evaluates project velocity and delivery efficiency (Completed vs. Total Issues).
3.  **HubSpot:** Uses recent deal success as a proxy for client satisfaction and demand.
4.  **Market Data:** Simulates competitor analysis and regional rate benchmarks via `market_analysis` module.

### Analysis Logic (LLM)
The LLM acts as a Chief Economic Officer, synthesizing the data to answer:
- Is the current price sustainable given the internal cost/efficiency?
- Is the price competitive compared to the simulated market rates?
- What is the recommended adjustment to maximize profit without risking churn?

### Idempotency
- The tool checks `EpisodicMemory` for any pricing optimization runs within the last 24 hours.
- If a recent run exists, it returns the cached recommendation to prevent redundant API costs and conflicting advice.

### Output
A structured JSON recommendation:
```json
[
  {
    "service_name": "Web Development",
    "current_price": 150,
    "recommended_price": 165,
    "confidence_score": 0.85,
    "reasoning": "High demand (85% win rate) and market rates for Senior devs trending to $180."
  }
]
```

## Approval & Execution
Currently, the tool provides **recommendations only**.
- **Phase 1 (Current):** Recommendations are logged to `EpisodicMemory` and included in the Executive Business Insight Report.
- **Phase 2 (Future):** Integration with an approval workflow to automatically update standard rate cards in Xero/HubSpot upon human confirmation.
