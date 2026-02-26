# Economic Optimization Workflow

## Overview
The Economic Optimization workflow leverages the `adjust_service_offerings` tool to provide autonomous, data-driven recommendations for service bundling and packaging. By analyzing internal performance metrics (financial, delivery efficiency, client satisfaction) alongside external market data, the system ensures the agency's offerings remain relevant and profitable.

## Workflow Triggers
- **Quarterly Business Review:** Automated trigger via `economic_optimization_workflow`.
- **Manual Invocation:** Ad-hoc analysis when launching new services or reacting to market shifts.

## Tool: `adjust_service_offerings`

### Inputs
- `current_bundles`: A list of current service bundles.
  - `name`: Bundle name (e.g., "Full Stack Maintenance").
  - `price`: Monthly retainer or fixed price.
  - `components`: (Optional) List of included services/deliverables.
  - `active_clients`: (Optional) Number of clients currently on this plan.

### Data Sources
1.  **Xero:** Analyzes revenue trends and invoice payment status (Last 30 Days).
2.  **Linear:** Evaluates project velocity and delivery efficiency (Completed vs. Total Issues).
3.  **HubSpot:** Uses recent deal success as a proxy for client satisfaction and demand.
4.  **Market Data:** Simulates competitor analysis and regional rate benchmarks via `market_analysis` module.

### Analysis Logic (LLM)
The LLM acts as a Chief Strategy Officer, synthesizing the data to answer:
- Are current bundles profitable given the internal cost/efficiency?
- Are there gaps in the market we should address with new bundles?
- Should underperforming bundles be retired or modified?
- What is the recommended price point for new or modified bundles?

### Idempotency
- The tool checks `EpisodicMemory` for any service adjustment runs within the last 24 hours.
- If a recent run exists, it returns the cached recommendation to prevent redundant API costs and conflicting advice.

### Output
A structured JSON recommendation:
```json
[
  {
    "action": "create",
    "bundle_name": "AI Automation Audit",
    "description": "A new entry-level package to assess client readiness for AI integration.",
    "target_price": 2500,
    "expected_margin": 0.4,
    "reasoning": "High market growth in AI sector (12.5%) and strong internal efficiency in similar audit tasks.",
    "confidence_score": 0.9
  },
  {
    "action": "modify",
    "bundle_name": "Legacy Maintenance",
    "description": "Increase price to reflect higher support costs.",
    "target_price": 3000,
    "expected_margin": 0.25,
    "reasoning": "Margins slipping due to increased cycle time on legacy tickets.",
    "confidence_score": 0.8
  }
]
```

## Verification
The functionality of this tool is validated via an integration test:
- [tests/integration/service_adjustment_validation.test.ts](../../tests/integration/service_adjustment_validation.test.ts)
