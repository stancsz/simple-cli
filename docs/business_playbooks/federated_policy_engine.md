# Federated Policy Engine Playbook

## Overview
The **Federated Policy Engine** is the governance mechanism for the Autonomous Corporate Consciousness. It allows "C-Suite" agents (or authorized human operators) to set high-level operating policies that dynamically update the behavior of all autonomous swarms.

## Core Concepts

### Corporate Policy
A `CorporatePolicy` is a versioned document stored in the Brain's Episodic Memory. It defines global parameters such as:
- **Min Margin**: The minimum acceptable profit margin for any project.
- **Risk Tolerance**: The acceptable level of risk ("low", "medium", "high").
- **Max Agents per Swarm**: The maximum resource allocation for a single client.

### Policy Propagation
When a policy is updated, it is stored as the new "Active" policy.
- **Pull Model**: Swarms (via the Fleet Manager) automatically fetch the latest active policy during their routine `get_fleet_status` checks.
- **Compliance**: The Fleet Manager evaluates every swarm against the active policy and flags violations (e.g., a swarm running at low margin when the policy requires high margin).

## Tools

### `update_operating_policy`
Updates the global operating policy. This action creates a new version of the policy.

**Parameters:**
- `name`: Name of the policy (e.g., "Q4 Conservative").
- `description`: Description of the strategic intent.
- `min_margin`: (0.0 - 1.0) Minimum profit margin.
- `risk_tolerance`: "low" | "medium" | "high".
- `max_agents_per_swarm`: Integer cap on agents.
- `company`: (Optional) Target specific company.

**Example Usage:**
```json
{
  "name": "Recession Protocol Alpha",
  "description": "Tighten margins and reduce risk due to market volatility.",
  "min_margin": 0.35,
  "risk_tolerance": "low",
  "max_agents_per_swarm": 8
}
```

### `get_active_policy`
Retrieves the currently active policy for inspection.

### `rollback_operating_policy`
Reverts the operating policy to the previous version. This is useful if a new policy causes unexpected operational issues.

## Workflow

1. **Strategic Shift**: The CEO Agent (or human) determines a need for a policy change (e.g., aggressive growth vs. conservation).
2. **Policy Update**: The Agent calls `update_operating_policy`.
3. **Propagation**:
   - The Fleet Manager's `get_fleet_status` tool now includes `policy_version` and `compliance_status`.
   - Swarms that violate the new policy are flagged (`status: "violation"`).
4. **Correction**:
   - The Scaling Engine and Economic Engine (in future phases) will read the compliance status and auto-correct (e.g., scale down agents, raise prices).

## Verification
The system is validated via `tests/integration/policy_engine_validation.test.ts`, which simulates:
- Policy creation and versioning.
- Fleet status compliance checks.
- Policy rollback.
