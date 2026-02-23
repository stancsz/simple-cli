# Operational Hardening & Stress Testing

## Overview
As part of the **Phase 15: Operational Hardening** initiative, the Simple CLI platform has undergone rigorous stress testing to ensure stability, resilience, and performance under high-concurrency and chaotic conditions. This document outlines the testing methodology, results, and benchmarks.

## Stress Test Methodology

We employ two primary stress testing strategies:

### 1. Long-Running 7-Day Simulation
**File:** `tests/stress/long_running_stress.test.ts`
**Command:** `npm run test:stress`

This test simulates a full week of continuous operation, compressing time to validate:
- **Scheduler Reliability:** Cron jobs triggering on schedule (Morning Standup, HR Review, Nightly Dreaming).
- **Memory Persistence:** Brain (LanceDB) storage and retrieval over prolonged periods.
- **Chaos Recovery:** The system's ability to recover from injected failures (latency spikes, API timeouts, crashes).
- **Desktop Orchestration:** Periodic "Research Sessions" using the Desktop Router to cycle through backends (Stagehand, Anthropic, Skyvern).
- **Metric Tracking:** Validation that all operational metrics are correctly logged to `.agent/metrics/`.

### 2. High-Concurrency Orchestrator Stress
**File:** `tests/integration/desktop_orchestrator_stress.test.ts`

This test targets the **Polyglot Desktop Orchestrator** specifically:
- **Load:** Simulates 100+ concurrent task requests.
- **Routing:** Verifies LLM-based and heuristic routing logic under load.
- **Resilience:** Injects random failures (10% rate) and latency (10-50ms) into mock drivers to ensure the router handles exceptions gracefully.

### 3. Skyvern Driver Validation
**File:** `tests/integration/skyvern_validation.test.ts`

This test validates the **Skyvern Driver** integration:
- **Scenarios:** Form Submission, Navigation & Screenshot, Structured Data Extraction.
- **Routing:** Verifies that form-heavy and complex tasks are correctly routed to Skyvern.
- **Live/Mock:** Supports running against a live Skyvern instance (via `docker-compose.test.yml`) or using mocks for CI speed.

## Performance Benchmarks

Based on the latest test runs:

| Component | Metric | Value | Notes |
| :--- | :--- | :--- | :--- |
| **Desktop Router** | Routing Latency | ~0.5ms (Heuristic) / ~50ms (Simulated LLM) | Extremely fast overhead for task dispatching. |
| **Throughput** | Tasks/Sec | ~1900 tasks/sec | Validated with 100 concurrent tasks completing in ~52ms. |
| **Brain Recall** | Latency | ~20ms | Consistent performance even with growing memory bank. |
| **Recovery Rate** | Success % | 100% | The HR Loop and self-healing mechanisms successfully addressed all 6 injected major failures during the 7-day sim. |

## Observability

The system now features enhanced observability:
- **Structured Logging:** All desktop drivers (Stagehand, Anthropic, OpenAI, Skyvern) log `execution_latency`, `action`, and `status` to `metrics/*.ndjson`.
- **Routing Decisions:** The Desktop Router logs every decision, including the method used (`override`, `heuristic`, `llm`).
- **Health Monitor:** Aggregates these metrics for the Dashboard (`simple dashboard`).

## Running the Tests

To validate the system yourself:

1.  **Run the 7-Day Simulation:**
    ```bash
    npm run test:stress
    ```
    *Expect success with a summary of days simulated and recoveries triggered.*

2.  **Run the Concurrency Test:**
    ```bash
    npx vitest run tests/integration/desktop_orchestrator_stress.test.ts
    ```
    *Expect ~90% success rate (due to intentional 10% chaos failure injection).*

## Future Improvements
- **Real Browser Stress:** Future tests will integrate headless browser swarms to validate `StagehandDriver` under actual rendering load.
- **Network Chaos:** Introduce network partitioning simulations to test distributed MCP server resilience.

## Automated Roadmap Hygiene

To maintain an accurate reflection of project progress without manual overhead, we have implemented an automated synchronization system:

- **Component:** `roadmap_sync` MCP Server.
- **Mechanism:**
    - **Scheduled:** Runs every Sunday at 2 AM via the Scheduler MCP.
    - **Trigger:** Scans the last 50 commits for `[x]`, `feat:`, `fix:`, or `completed:` patterns.
    - **Action:**
        - Updates `docs/ROADMAP.md`: Marks matching items as completed with a timestamp.
        - Updates `docs/todo.md`: Strikes through completed items.
        - Adds a "Last Updated" footer to the roadmap.
- **Benefit:** Ensures that the public documentation always reflects the actual state of the codebase, fostering trust and transparency.

## Predictive Operations

The Health Monitor now includes real-time anomaly detection and predictive analytics to shift from reactive to proactive operations.

### Anomaly Detection
- **Mechanism:** Rolling Z-Score and Interquartile Range (IQR) analysis on key metrics (latency, token usage, error rates).
- **Thresholds:** Automatically flags values deviating >3 standard deviations from the moving average (last 100 data points).
- **Visualization:** The new `IntelligenceView` in the Dashboard highlights anomalies with severity levels (Low, Medium, High).

### Alert Correlation
- **Logic:** Groups related alerts occurring within a 5-minute window into single "Incident" tickets.
- **Benefit:** Reduces alert fatigue by condensing noisy streams into actionable, context-rich incidents.

### Metric Forecasting
- **Algorithm:** Simple linear regression on recent time-series data.
- **Capability:** Predicts metric trends (e.g., "Token usage projected to exceed quota in 45 mins") to enable preemptive scaling or throttling.
