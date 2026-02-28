# Market Positioning Workflow

**Purpose**: To autonomously analyze the competitive landscape and adjust the agency's `CorporateStrategy` (vision, objectives, positioning) to maintain a competitive edge. This workflow operates as part of the Phase 26 Autonomous Market Expansion system.

**Trigger**: Executed periodically (e.g., monthly) by the Dreaming MCP via a scheduled task. Can also be triggered manually by the CSO persona or operator.

## Process Overview

### 1. Context Assembly
The `analyze_and_adjust_positioning` tool (within the `business_ops` MCP) gathers all required context:
- **Current Strategy**: Fetches the active `CorporateStrategy` from the Brain MCP (`read_strategy`).
- **Market Data**: Invokes `collect_market_data` for a specified sector and region to obtain growth metrics, emerging trends, and demand scores.
- **Competitor Intelligence**: If provided with competitor URLs, calls `analyze_competitor_pricing` to scrape and analyze pricing models and feature sets.

### 2. Strategic Synthesis
The gathered context is passed to the LLM acting as the Chief Strategy Officer (CSO). The model is prompted to:
- Synthesize trends and competitor weaknesses.
- Draft specific, actionable updates to the agency's vision, objectives, and market positioning.
- Determine if the proposed changes represent a major strategic shift (e.g., fundamentally changing the target audience or core value proposition).

### 3. Execution & Governance
- **No Major Pivot**: If the changes are minor or incremental, the system outputs an analysis report and the adjusted strategy for the next planning cycle.
- **Major Pivot Required**: If the LLM sets `requires_pivot` to `true`, the tool autonomously calls `propose_strategic_pivot` (Brain MCP). This triggers the Phase 25 Corporate Governance loop, requiring a multi-persona C-Suite board meeting (CEO, CFO, CSO) to review and ratify the major pivot before it becomes the active policy.

## Success Criteria
- Market data is successfully combined with current strategic context.
- The LLM accurately assesses the magnitude of the proposed changes.
- Significant pivots are correctly routed through the `propose_strategic_pivot` governance tool.
