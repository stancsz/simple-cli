# Phase 34: Ecosystem Intelligence & Meta-Learning

## Overview
Phase 34 introduces the capability for the root Simple-CLI agency to perform meta-learning across the entire ecosystem of child agencies. It analyzes patterns, successes, and failures to recursively optimize global policies, resource distribution, and strategic direction.

## Architecture & Integration

### 1. `analyze_ecosystem_patterns` (Brain MCP)
- **File**: `src/mcp_servers/brain/tools/pattern_analysis.ts`
- **Purpose**: Queries the Brain's episodic memory for entries logged by child agencies (filtered by `source_agency`).
- **Functionality**: Performs LLM-driven analysis to identify common success themes, bottlenecks, and performance insights across the ecosystem. It outputs a structured JSON report mapping these insights.

### 2. `propose_ecosystem_policy_update` (Brain MCP)
- **File**: `src/mcp_servers/brain/tools/strategy.ts`
- **Purpose**: Translates ecosystem analysis into actionable governance.
- **Functionality**: Uses an LLM to review the analysis report and draft an update to the `CorporateStrategy` or `OperatingPolicy`. It relies on the existing `proposeStrategicPivot` tool to formalize the adoption.

### 3. Scheduler Integration
- **File**: `src/scheduler/config.ts`
- **Purpose**: Ensures continuous, automated learning.
- **Functionality**: Adds the `weekly_ecosystem_analysis` cron task, running the `analyze_ecosystem_patterns` tool periodically.

### 4. Health Monitor Integration
- **File**: `src/mcp_servers/health_monitor/index.ts`
- **Purpose**: Observability for ecosystem state.
- **Functionality**: The new `get_ecosystem_health` tool surfaces insights based on the ecosystem patterns, allowing the root agency to keep track of its intelligence cycle status.

## Lifecycle
1. **Child Agencies Operate**: Child agencies (from Phase 33) resolve tasks and log outcomes to the root episodic memory (tagged with their respective `source_agency`).
2. **Analysis Triggered**: The Scheduler triggers `analyze_ecosystem_patterns` periodically.
3. **Insights Generated**: The Brain MCP aggregates memories across the ecosystem and generates a pattern report.
4. **Policy Proposed**: The report is passed to `propose_ecosystem_policy_update` to adapt global policies.
5. **Strategy Pivot**: New strategies or operating parameters are pushed back down through the multi-agency network via Phase 25/31 mechanisms.
