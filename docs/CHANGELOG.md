# Changelog

All notable changes to this project will be documented in this file.

## [Phase 23] - 2026-02-26

### Added
- **Agency Dashboard**: Unified operational dashboard (Phase 23).
  - MCP Server at `src/mcp_servers/agency_dashboard/`.
  - React UI at `scripts/dashboard/ui/`.
  - CLI command `simple dashboard --agency`.
  - Panels for Swarm Fleet, Financial KPIs, System Health, Client Health.

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
