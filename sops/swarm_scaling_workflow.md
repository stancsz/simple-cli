# Swarm Scaling Workflow

This SOP describes the autonomous scaling logic for the Swarm system, which dynamically adjusts agent pools based on workload.

## Overview
The scaling system monitors key metrics (e.g., Linear issues, Xero invoices) and spawns or terminates sub-agents to handle the load. This ensures optimal resource usage and responsiveness.

## Components
- **Business Ops MCP**: Hosts the scaling logic and tools (`monitor_workload`, `scale_swarm_up`, `scale_swarm_down`).
- **Swarm Server**: Provides the underlying agent orchestration (spawning, termination).
- **Configuration**: `config/scaling_rules.json` defines thresholds and actions.
- **Scheduler**: Runs `monitor_workload` every 10 minutes.

## Configuration Rules
Rules are defined in `config/scaling_rules.json`. Example:

```json
{
  "metric": "linear.issues.bugs",
  "threshold": 5,
  "action": "spawn",
  "agent_template": "support_agent",
  "count": 1,
  "cooldown_threshold": 2,
  "cooldown_action": "terminate"
}
```

- **metric**: The data point to monitor (currently supports `linear.issues.bugs`).
- **threshold**: Value above which scaling up occurs.
- **count**: Number of agents to spawn when scaling up.
- **cooldown_threshold**: Value below which scaling down occurs.

## Workflow
1. **Monitor**: The scheduler triggers `monitor_workload` in `business_ops`.
2. **Evaluate**: The tool checks Linear API for bug counts and compares with active agents.
3. **Action**:
   - **Scale Up**: If pending bugs >= threshold, new `support_agent` instances are spawned via `SwarmServer`.
   - **Scale Down**: If pending bugs <= cooldown_threshold, excess agents are terminated.
4. **Logging**: All actions are logged to the MCP console (and Brain in future iterations).

## Manual Control
You can manually scale the swarm using:
- `scale_swarm_up(role, task)`
- `scale_swarm_down(agent_id)`
