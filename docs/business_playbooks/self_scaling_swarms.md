# Self-Scaling Swarms Playbook

## Executive Summary
This playbook outlines the operational strategy for deploying Self-Scaling Swarms to manage client project workloads dynamically.

## Use Case: Startup MVP Crunch
A client project "Startup MVP" has a tight deadline. The team needs to scale up development resources during a sprint crunch and scale down during weekends or inactivity.

### Scenario
1. **Monday 9:00 AM**: Project Manager creates 5 High Priority tickets in Linear for "User Authentication" and "Payment Gateway".
2. **Monday 10:00 AM**: The `project-workload-monitor` task runs.
   - Detects 5 High Priority issues.
   - Checks Scaling Rules: `open_high_priority_issues > 3` -> ensure 2 Senior Developers.
   - Current Agents: 0.
   - Action: Spawns 2 agents (Role: Senior Developer).
   - Agents begin working on assigned tasks.
3. **Wednesday 5:00 PM**: Tasks are completed and moved to "Done". Open High Priority issues drop to 1.
   - Monitor detects workload decrease.
   - Desired Agents: 0 (Default minimum).
   - Action: Terminates 2 agents to save costs.
4. **Friday 4:00 PM**: Client reports a critical bug (Urgent).
   - Monitor detects 1 Urgent issue.
   - Checks Scaling Rules: `open_urgent_issues > 0` -> ensure 3 Tech Leads.
   - Action: Spawns 3 agents immediately.
5. **Sunday**: No activity for 48 hours.
   - Monitor detects inactivity.
   - Action: Reduces active agents if any remain.

## Configuration
Scaling rules are defined in `.agent/scaling_rules.json`.
Example:
```json
{
  "rules": [
    {
      "condition": "open_high_priority_issues > 3",
      "action": "ensure_minimum_agents",
      "count": 2,
      "role": "Senior Developer",
      "priority": 2
    }
  ]
}
```

## Monitoring & Reporting
- Check `.agent/logs/` for execution logs.
- Use `business_ops.monitor_projects` tool manually to force a check.
