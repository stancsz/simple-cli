# Self-Scaling Swarm Workflow

This SOP governs the autonomous scaling of agent swarms based on client workload demand.

1. **Evaluate Demand**: Use `evaluate_demand` to check open issues and recent activity for the client.
2. **Analyze Workload**:
   - If demand is "high" (issues >= threshold), proceed to Scale Up.
   - If demand is "low" (issues == 0), proceed to Scale Down.
   - Otherwise, maintain current state.
3. **Scale Up (If High Demand)**:
   - Identify the primary bottleneck (e.g., "React Frontend", "Backend API").
   - Call `scale_swarm` with `action="spawn"`, `role="<Role>"`, and `task="Resolve high priority issues"`.
4. **Scale Down (If Low Demand)**:
   - Identify idle agents.
   - Call `scale_swarm` with `action="terminate"` for idle agents.
5. **Log Action**: Ensure the scaling decision is logged to the Brain (handled by the tool).
