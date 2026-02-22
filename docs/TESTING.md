# Testing Guide

## 4-Pillars Integration Test

The 4-Pillars Integration Test (`tests/integration/four_pillars_integration.test.ts`) is the comprehensive validation framework for the Simple CLI's core capabilities. It simulates a real-world consulting scenario to ensure all major components work in harmony.

### Scope
1.  **Company Context**: Onboarding a new client (`test-client`) and loading their profile.
2.  **SOP Engine**: Executing a multi-step Standard Operating Procedure (`deployment.md`) using the `sop_engine` MCP server.
3.  **The Brain (Ghost Mode)**: Logging experiences and outcomes to the persistent memory (`brain` MCP server).
4.  **HR Loop**: Performing a weekly review to analyze logs and generate optimization proposals (`hr` MCP server).

### Running the Test
```bash
npm test -- tests/integration/four_pillars_integration.test.ts
```

### Implementation Details
-   **Mocks**: Uses `vitest` to mock `LLM` (deterministic responses) and `MCP` (in-process tool routing).
-   **Fixtures**: Uses `tests/fixtures/four_pillars/` for company profiles and SOPs.
-   **Assertions**: Verifies file creation, Brain log entries, and HR proposals.

## End-to-End Production Simulation

The E2E Production Simulation (`tests/integration/e2e_production_simulation.test.ts`) is the ultimate validation of the "4-Pillar Vision". It simulates a complete 24-hour cycle of a digital agency.

### Scope
1.  **Company Context**: Loads a mock company profile (Stellar Tech).
2.  **SOP Execution**: Runs a realistic SOP (`onboard_new_project.md`) to verify task execution.
3.  **Ghost Mode**: Simulates a 24-hour cycle, triggering "Morning Standup" (9 AM) and "HR Review" (12 PM) via a mock Scheduler.
4.  **HR Loop**: Simulates error logs to trigger HR analysis and proposal generation.
5.  **Artifact Validation**: Verifies Brain memories and HR proposals.

### Running the Test
```bash
npm test -- tests/integration/e2e_production_simulation.test.ts
```

## Long-Running Stress Test

The Stress Test (`tests/stress/long_running_stress.test.ts`) simulates an extended 7-day operational period to validate system stability, self-healing, and metric tracking under load.

### Scope
1.  **7-Day Simulation**: Compressed timeline (minutes instead of days) simulating a full week of operation.
2.  **Daily Routine**: Triggers Morning Standups, Workload Bursts, HR Reviews, and Nightly Dreaming.
3.  **Chaos Injection**: Randomly injects high latency and errors into tool calls.
4.  **Resilience**: Verifies the system recovers from errors and HR Loop proposes fixes.
5.  **Metrics & Alerting**: Validates that the Health Monitor tracks metrics and alerts on anomalies.

### Running the Test
```bash
npm test -- tests/stress/long_running_stress.test.ts
```
