# Market Positioning Automation Workflow

## Objective
To continuously monitor the competitive landscape and autonomously adjust the agency's market positioning and operating policies based on identified gaps, opportunities, and threats.

## Components
- **Business Ops MCP (`market_positioning.ts`)**: Contains tools for analyzing the competitive landscape and proposing actionable positioning adjustments.
- **Brain MCP (`episodic.ts`)**: Stores the Corporate Strategy and policy episodes.
- **Policy Engine (`policy_engine.ts`)**: Handles the versioning and implementation of new operating policies based on strategic pivots.

## Workflow

1. **Data Collection**
   - The `analyze_competitive_landscape` tool is invoked (typically via a periodic scheduling system or manually by an executive agent).
   - It fetches broad market data (sector, region) and targeted competitor pricing/offering data via existing market analysis tools.

2. **Analysis and Synthesis**
   - An LLM synthesizes the collected data into a structured **Competitive Landscape Report**.
   - The report highlights market overview, competitor summaries, identified gaps, opportunities, and threats.

3. **Positioning Adjustment Proposal**
   - The `propose_positioning_adjustment` tool takes the competitive analysis and cross-references it with the current **Corporate Strategy**.
   - An LLM acts as the Chief Strategy Officer to propose actionable recommendations.
   - It determines if a proposed adjustment represents a "high-confidence" pivot that requires changes to operational parameters (e.g., minimum margin, risk tolerance).

4. **Policy Enforcement**
   - If configured for autonomous updates (`auto_update_policy=true`) and the recommendation is high-confidence, the system calls the **Policy Engine**.
   - A new version of the Corporate Policy is created and stored in Episodic Memory, instantly altering the operational constraints of the agency's autonomous swarms.

## Execution Frequency
This workflow should ideally run at the start of every business quarter or when significant market disruption is detected by the Strategic Horizon Scanner.