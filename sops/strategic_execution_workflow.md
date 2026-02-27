# Standard Operating Procedure: Strategic Execution Loop

## 1. Purpose
The Strategic Execution Engine bridges the gap between high-level autonomous corporate strategy (formulated by the C-Suite personas) and ground-level execution (handled by agency swarms). It ensures that the operational KPIs, active fleet status, and strategic goals are continuously aligned by generating actionable, prioritized Linear issues.

## 2. Overview
This SOP outlines the workflow for translating abstract strategic shifts into concrete tasks. The `generate_strategic_initiatives` tool in the `business_ops` MCP server continuously (or on-demand) queries the overarching vision, analyzes the current performance and fleet state, and outputs new initiatives to close strategic gaps.

## 3. Workflow Steps
### Step 1: Trigger Mechanism
- The execution engine can be invoked automatically after a successful Board Meeting (Phase 25), or run manually on a periodic basis (e.g., weekly).

### Step 2: Information Gathering
The `generate_strategic_initiatives` tool orchestrates data fetching:
- **Corporate Strategy:** Retrieves the latest `CorporateStrategy` object via the `brain` MCP server (`read_strategy`).
- **Performance Metrics:** Fetches recent revenue, efficiency, and client health scores using `analyze_performance_metrics` (Xero, Linear, HubSpot integrations).
- **Fleet Status:** Gathers the current operational capacity and active projects using `getFleetStatusLogic`.

### Step 3: LLM Gap Analysis
- An LLM (acting as the Chief Operating Officer) is prompted with the gathered data.
- The LLM identifies the largest delta between the strategic objectives and the current operational reality.
- It outputs exactly 3 top actionable initiatives tailored to close these gaps.

### Step 4: Execution Automation
- For each initiative, the tool verifies the existence of a "Strategic Initiatives" project in Linear (or creates one).
- It generates a detailed Linear issue for each initiative, complete with titles, descriptions linking back to the strategy, and appropriate priority levels.

### Step 5: Logging and Auditing
- The outcomes (issue URLs and the LLM's rationale) are stored in the Episodic Memory as a `strategic_execution_log`. This enables future strategic horizons to reference past executed initiatives.

## 4. Error Handling
- If the Brain cannot locate a `CorporateStrategy`, the workflow safely aborts.
- If Linear API calls fail, the workflow tracks the failures and returns a partial success summary with error details.

## 5. Maintenance
Ensure the integrations to Xero, HubSpot, and Linear maintain correct authentication keys. The underlying prompt in `strategic_execution.ts` should be updated if the corporate taxonomy changes.