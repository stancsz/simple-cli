# Elastic Swarms (Auto-Scaling Agents)

## Overview
Elastic Swarms enable the Simple Biosphere to dynamically scale its workforce based on real-time business metrics. This system monitors key indicators (e.g., ticket volume, unread messages) and automatically spawns or terminates specialized agents to handle the load.

## Architecture
The system consists of three main components:
1.  **Swarm Manager**: A background service within `business_ops` that polls metrics and evaluates scaling rules.
2.  **Configuration**: Rules defined in `config/elastic_swarms.json`.
3.  **Swarm Execution**: Leverages the `swarm` MCP server to spawn and terminate agents.

## Configuration
The scaling rules are defined in `config/elastic_swarms.json`. Each rule specifies a trigger condition and a corresponding action.

### Example Configuration
```json
{
  "rules": [
    {
      "trigger": {
        "source": "linear",
        "metric": "open_issues",
        "threshold": 50,
        "operator": ">="
      },
      "action": {
        "swarm_type": "triage_agent",
        "type": "scale_up",
        "count": 2,
        "task": "Review and categorize open issues."
      }
    }
  ]
}
```

### Trigger Fields
- `source`: The metric source (e.g., "linear", "hubspot").
- `metric`: The specific metric to monitor.
- `threshold`: The value to compare against.
- `operator`: Comparison operator (">=", "<=", etc.).

### Action Fields
- `swarm_type`: The role of the agent to spawn/terminate.
- `type`: "scale_up" or "scale_down".
- `count`: Number of agents to add/remove.
- `task`: (Optional) Initial task description for new agents.

## Usage

### Automated Scaling
The Swarm Manager runs periodically (triggered by the Scheduler) and automatically applies scaling actions.

### Manual Scaling
You can manually trigger scaling using the `scale_swarm` tool:
```bash
# Scale up Triage Agents
scale_swarm(swarm_type="triage_agent", action="scale_up", count=1)
```

## Supported Metrics
Currently, the system supports:
- **Linear**: `open_issues`
- **HubSpot**: `unread_conversations`

(Note: In the current implementation, these metrics are mocked or read from environment variables for testing purposes.)
