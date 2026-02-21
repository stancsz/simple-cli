# Operational Excellence

## Overview
This document outlines the strategies and tools used to maintain high operational standards for the Simple CLI agent.

## Production Validation Procedures

To ensure reliability in production, we mandate rigorous testing before deployment.

### Stress Testing & Multi-Tenancy
We use `tests/integration/multi_company_stress.test.ts` to simulate production load.
- **Concurrent Tenants:** Simulates 3+ distinct companies operating simultaneously.
- **Isolation Verification:** Ensures that:
    - **Brain Memory:** Vector data is strictly isolated per company (via `episodic_memories_{company}` tables).
    - **SOP Logs:** Execution logs are stored in company-specific directories (`.agent/companies/{company}/brain/sop_logs.json`).
    - **HR Proposals:** Improvement proposals are routed to the correct company context (`.agent/companies/{company}/hr/proposals/`).
- **Resilience:** Verifies that failures in one tenant do not impact others.

### Key Metrics
- **Isolation:** Zero data leakage between tenants.
- **Performance:** Operations must complete within acceptable latency limits under concurrent load.
- **Stability:** No OOM or unhandled exceptions during stress tests.

## Monitoring
Refer to `docs/HEALTH_MONITORING.md` for real-time monitoring setup.
