# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]
### Added
- **Elastic Swarms**: Implemented auto-scaling agent system (`src/mcp_servers/elastic_swarm/`).
- **Kubernetes HPA**: Added HorizontalPodAutoscaler configuration for agent replicas based on queue length.
- **Swarm Improvements**: Added `terminate_agent` and `get_agent_metrics` tools to `swarm` MCP server.
- **Daemon Refactor**: Refactored `daemon.ts` to use `Scheduler` class and persist state for monitoring.

## [1.0.0] - 2025-01-26

### Validated
- **Production Validation Suite**: Executed and verified comprehensive integration tests for production readiness.
    - `tests/integration/production_validation.test.ts`: Validates 4-pillar integration (Context, SOPs, Ghost Mode, HR Loop) in a multi-tenant environment.
    - `tests/integration/k8s_production_validation.test.ts`: Simulates Kubernetes deployment with sidecars (Brain, Health Monitor), validating persistence, isolation, and metrics.
    - `tests/integration/showcase_simulation.test.ts`: Validates the end-to-end "Showcase Corp" scenario.

### Improved
- **Test Robustness**:
    - Hardened `tests/integration/k8s_production_validation.test.ts` to reliably handle process restarts and port cleanup using `waitForPortClosed` and direct `tsx` execution, resolving flakiness in the persistence test.

### Verified
- **Production Readiness**: Confirmed that the system handles multi-tenancy, persistence, and autonomous loops (Ghost Mode, HR) correctly under simulated production conditions.
