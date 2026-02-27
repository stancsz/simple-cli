# Service Portfolio Optimization

## Overview
The `adjust_service_offerings` tool automates the analysis of agency performance and market trends to recommend profitable adjustments to the service portfolio. It acts as a digital Chief Strategy Officer, ensuring offerings remain competitive and high-margin.

## Tool: `adjust_service_offerings`

### Purpose
To synthesize internal financial/delivery metrics with external market intelligence (trends, competitor pricing) and propose specific, actionable service bundles.

### Inputs
- **`timeframe`** (optional, default: `'last_quarter'`): The period for analyzing internal performance (e.g., `'last_30_days'`, `'last_quarter'`, `'year_to_date'`).
- **`target_margin`** (optional, default: `0.4`): The desired profit margin for new offerings (e.g., 0.4 = 40%).

### Logic Flow
1. **Performance Analysis**: Aggregates data from Xero (Revenue, Margins), Linear (Velocity, Efficiency), and HubSpot (Client Satisfaction).
2. **Market Analysis**: Simulates market trend data (e.g., "AI Integration demand") and enhances it via LLM knowledge.
3. **Strategic Synthesis**: The LLM analyzes the gap between internal capabilities and market demand to generate 3-5 service bundles.
4. **Output Generation**: Returns structured JSON with bundle details and implementation steps.

### Example Usage
```typescript
// Quarterly Portfolio Review
const result = await use_mcp_tool("business_ops", "adjust_service_offerings", {
  timeframe: "last_quarter",
  target_margin: 0.5 // Targeting 50% margin
});

console.log(result.recommendations);
/* Output Example:
[
  {
    "name": "AI-Driven Security Audit",
    "description": "Automated vulnerability scanning paired with expert manual review.",
    "target_client": "Fintech Scale-ups",
    "projected_margin": 0.55,
    "implementation_steps": ["Integrate Snyk", "Train security swarm", "Update marketing assets"]
  }
]
*/
```

## Integration with Economic Engine
This tool is a key component of the **Self-Optimizing Economic Engine** (Phase 24). It closes the loop between *observing* performance (Performance Analytics) and *acting* on it (Service Adjustment), driven by market reality (Market Analysis).
