# Market Positioning Automation Playbook

## Overview
The **Market Positioning Automation** tool continuously monitors the competitive landscape, analyzes it against the agency's current Corporate Strategy, and recommends (or autonomously executes) strategic positioning adjustments. This ensures the agency remains competitive, capitalizes on emerging market gaps, and defends against competitive threats.

## Tool Details
- **Tool Name:** `analyze_and_adjust_positioning`
- **MCP Server:** `business_ops`
- **Phase:** Phase 26 (Autonomous Market Expansion)

## Core Capabilities
1. **Strategic Context Alignment:** Retrieves the current Corporate Strategy from Episodic Memory to understand the agency's vision and target markets.
2. **Market Intelligence Gathering:** Automatically collects relevant market data based on the target markets identified in the strategy.
3. **Competitor Analysis:** Scrapes and analyzes competitor websites to extract pricing models, value propositions, and feature tiers.
4. **LLM Synthesis:** Uses an LLM to identify gaps, opportunities, and threats by comparing market/competitor data against the agency's strategy.
5. **Actionable Recommendations:** Outputs specific recommendations (e.g., messaging pivots, new service tiers).
6. **Autonomous Pivots (Optional):** If the `auto_pivot` flag is set to `true` and the LLM's confidence score is high (≥ 0.8), the tool automatically proposes a strategic pivot via the Brain MCP.

## Usage Example

### Basic Analysis (Recommendation Only)
To run a basic analysis without automatically changing the corporate strategy:

```json
{
  "company": "default",
  "competitor_urls": [
    "https://example-competitor-a.com/pricing",
    "https://example-competitor-b.com/services"
  ],
  "auto_pivot": false
}
```

### Autonomous Strategic Pivot
To empower the tool to automatically execute a strategic pivot if a high-confidence opportunity is found:

```json
{
  "company": "default",
  "auto_pivot": true
}
```

## Example Output
```json
{
  "analysis": {
    "gaps": ["No explicit HIPAA compliance service mentioned currently"],
    "opportunities": ["High demand for HIPAA compliance automation", "Target small clinics with a fast-turnaround tier"],
    "threats": ["Competitors offering low prices for standard compliance"]
  },
  "recommendations": [
    {
      "type": "messaging_pivot",
      "description": "Pivot messaging to emphasize HIPAA compliance for HealthTech clients",
      "actionable_steps": ["Update website copy", "Launch targeted email campaign"]
    },
    {
      "type": "new_tier",
      "description": "Introduce a fast-turnaround compliance tier",
      "actionable_steps": ["Define service SLA", "Set pricing at 20% premium over competitor Basic tier"]
    }
  ],
  "confidence_score": 0.9,
  "proposed_pivot_statement": "Pivot our primary value proposition to focus on rapid, AI-driven HIPAA compliance solutions for HealthTech startups."
}
```

## Integration with other systems
- **Brain MCP:** Uses `readStrategy` and `proposeStrategicPivot` to ensure alignment with corporate consciousness.
- **Market Analysis Tools:** Relies on `getMarketData` and `analyzeCompetitorPricingInternal` from the `business_ops` server.
- **Episodic Memory:** Stores the generated analysis report as `market_positioning_report` for future reference and context.
