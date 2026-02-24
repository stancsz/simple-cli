# Benchmark Methodology

This document outlines the methodology used to measure the performance, cost efficiency, and integration speed of the Simple-CLI platform compared to alternative "Direct Usage" approaches.

## Objectives
1.  **Validate Speed**: Measure how quickly Simple-CLI can integrate new frameworks ("Ingest-Digest-Deploy").
2.  **Validate Efficiency**: Measure token usage and latency reduction achieved by Simple-CLI's Shared Brain vs stateless or naive context loading.
3.  **Validate Autonomy**: measure the overhead cost of autonomous routing and quality gates in exchange for reliability.

## Test Suite

### 1. Framework Integration Speed
**Goal**: Measure the time to go from "Unknown CLI" to "Registered MCP Server".
-   **Method**: Run `integrate_framework` against a dummy CLI help text.
-   **Metrics**: Execution Time (ms).
-   **Comparison**: N/A (unique capability of Simple-CLI).

### 2. Code Editing (Context Efficiency)
**Goal**: Compare context loading efficiency.
-   **Scenario**: Refactoring a file in a repository with 20 files.
-   **Baseline (Direct Usage)**: Simulates loading *all* files into context (naive RAG or full repo context), typical of basic LLM usage.
-   **Simple-CLI**: Simulates loading only *relevant* files via the Brain (Vector Search).
-   **Metrics**: Preparation Time (ms), Token Count.

### 3. Multi-Agent Research (Token Efficiency)
**Goal**: Compare multi-turn research efficiency.
-   **Scenario**: "Research Node.js History" involving Search -> Summarize -> Review.
-   **Baseline (CrewAI-style)**: Simulates a multi-agent loop where full context is passed between agents (Researcher -> Writer -> Manager).
-   **Simple-CLI**: Simulates a shared-memory approach where agents read/write to the Brain, passing only pointers or new findings.
-   **Metrics**: Total Tokens Processed.

### 4. UI Automation (Orchestration Overhead)
**Goal**: Measure the cost of autonomy.
-   **Scenario**: Navigate to a page, fill a form, click submit.
-   **Baseline (Stagehand Direct)**: A raw script using `@browserbasehq/stagehand`. Fast but fragile.
-   **Simple-CLI**: The `DesktopOrchestrator` which adds:
    -   **Routing**: LLM decides which driver to use.
    -   **Quality Gate**: Visual LLM checks the page state before/after actions.
-   **Metrics**: Execution Time (ms), Token Usage (Router + QA).
-   **Note**: Simple-CLI is slower and more expensive per-action due to these checks, but gains resilience against UI changes.

## Data Collection
-   **Timing**: `Date.now()` high-resolution timestamps.
-   **Tokens**: Estimated using `gpt-tokenizer` or character-count proxies (4 chars/token).
-   **Cost**: Estimated at $0.01 / 1k input tokens (blended rate for reasoning models like DeepSeek R1 / Claude 3.5 Sonnet).

## Execution Environment
-   Benchmarks are run in CI/CD (GitHub Actions) or local environments.
-   Browser tests use `headless` mode.
-   LLM calls for "Integration Speed" are real (mocked in some dev environments).
-   LLM calls for other tasks are simulated to ensure deterministic, comparable metrics without fluctuating API latency.
