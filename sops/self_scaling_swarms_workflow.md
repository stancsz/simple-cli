# Self-Scaling Swarms Workflow

## Overview
The Self-Scaling Swarms system dynamically adjusts the number of active agents allocated to client projects based on workload metrics derived from Linear issues.

## Scaling Logic
The system monitors Linear projects hourly and applies the following logic:

### Workload Calculation
- **Open Issues**: Total number of unstarted/started issues.
- **High Priority**: Issues with Priority 1 (Urgent) or 2 (High).
- **Urgent**: Issues with Priority 1.

### Scaling Rules (Default)
1. **Urgent Response**: If there is at least 1 Urgent issue, ensure minimum 3 agents (Role: Tech Lead).
2. **High Load**: If there are > 3 High Priority issues, ensure minimum 2 agents (Role: Senior Developer).
3. **Inactivity**: If no activity (issue updates) for 48 hours, reduce active agents by 1.

Rules are configurable in `.agent/scaling_rules.json`.

## Architecture
- **Monitor Tool**: `business_ops.monitor_projects` (Runs hourly via Daemon).
- **Core Logic**: `scale_agents_for_project` in `business_ops`.
- **State Tracking**: Uses Brain (`episodic` memory) to record "Active Agent" assignments.
- **Agent Management**: Uses Swarm (`spawn_subagent`, `terminate_agent`) to manage lifecycle.

## Reconciliation
Since the Swarm server may restart (ephemeral), the system reconciles Brain records with actual running Swarm agents:
1. Fetch "Assigned Agents" from Brain (semantic query).
2. Fetch "Running Agents" from Swarm (`list_agents`).
3. Intersection determines "Actual Active Agents".
4. Spawns/Terminates are issued to reach "Desired Count".
5. Brain is updated with new Spawns.

## Failure Modes
- **Swarm Unavailable**: Logs error, no action taken.
- **Brain Unavailable**: Throws error, scaling aborts.
- **Linear API Error**: Logs error, skips project.
