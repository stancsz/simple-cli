# Strategic Execution Workflow (Phase 25.5)

## Overview
The **Strategic Execution Engine** automates the translation of high-level Corporate Strategy (stored in the Corporate Brain) into actionable ground-level tasks tracked in Linear. It bridges the gap between boardroom decisions and autonomous swarm execution.

## Trigger Conditions
- **Periodic Execution:** Scheduled via `crontab` to run periodically (e.g., weekly) as part of routine system operations.
- **Manual Trigger:** Initiated via the `generate_strategic_initiatives` MCP tool on demand.

## Tools & Context Used
- **`generate_strategic_initiatives` (Brain MCP):** Analyzes current KPIs against the Corporate Strategy to identify strategic gaps and auto-generates corresponding initiatives.

## Step-by-Step Procedure

1. **Context Retrieval**
   - **Corporate Strategy:** Reads the current, active strategy from the Brain's Episodic Memory via the `read_strategy` tool.
   - **Performance Metrics:** Retrieves efficiency, financial, and overall business performance via the `business_ops.analyze_performance_metrics` tool.
   - **System Health:** Fetches technical and infrastructure health via the `health_monitor.get_metrics` tool.
   - **Fleet Status:** Retrieves the utilization and status of the current agent swarm via the `business_ops.get_fleet_status` tool.

2. **Gap Analysis (LLM Processing)**
   - The engine uses an LLM acting as the Chief Operating Officer (COO).
   - It compares the current operational KPIs with the strategic objectives.
   - It outputs the top 3 actionable initiatives prioritized to close the largest strategic gaps.

3. **Initiative Creation (Linear Integration)**
   - **Project Verification:** Creates or ensures the existence of a "Strategic Initiatives" project in Linear via `business_ops.create_linear_project`.
   - **Issue Generation:** For each identified initiative, creates a Linear issue via `business_ops.create_linear_issue` detailing the specific actionable objective, description, and priority level.

4. **Auditing and Logging**
   - Logs the rationale and the generated initiative details as a `strategic_execution_log` entry in Episodic Memory for future context and transparency.

## Error Handling
- **Missing Strategy:** Fails fast if no Corporate Strategy exists.
- **Unavailable Metrics:** Reverts to a graceful failure mode for missing metrics (`status: "unavailable"`) and still generates initiatives based on whatever context is available.
- **Linear Integration Failures:** Continues processing the remaining initiatives even if one fails to post, logging all errors in the response output.
