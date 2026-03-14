# Phase 35: Ecosystem Optimization Validation

## Simulation Methodology
The ecosystem optimization capabilities introduced in Phase 35 are validated through a multi-agency simulation implemented in `tests/integration/phase35_ecosystem_optimization_validation.test.ts`.

### Process Overview:
1. **Spawning**: The test simulates a root agency and spawns 2+ child agencies (e.g., `agency_design`, `agency_backend`) using mocked `EpisodicMemory` records for `agency_spawning`.
2. **Policy Generation & Injection**: A simulated `ecosystem_policy` is generated, representing ecosystem-wide recommendations (like enabling strict caching and efficiency modes).
3. **Application**: The `apply_ecosystem_insights` tool from the `agency_orchestrator` MCP server fetches this policy, interprets it via an LLM, and successfully updates the individual `swarm_config` parameters for all targeted child agencies.
4. **Company Contexts**: The `update_company_with_ecosystem_insights` tool updates the client company context with these personalized insights.

### Efficiency Measurement:
The test executes a predefined set of varying complexity tasks in two scenarios:
- **Control Group (Baseline)**: Agencies operate with default configurations (`caching_enabled: false`, `efficiency_mode: false`).
- **Experimental Group (Optimized)**: Agencies operate with the ecosystem optimizations applied (`caching_enabled: true`, `efficiency_mode: true`).

The simulation measures execution time (`timeMs`) and token usage (`tokens`). The test mandates and explicitly asserts that the experimental group achieves an improvement of **≥15%** across all key metrics.
