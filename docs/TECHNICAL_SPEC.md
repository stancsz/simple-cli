# Simple Biosphere Technical Specification

## Core Architecture
The system consists of independent MCP (Model Context Protocol) servers communicating with an Orchestrator/Daemon loop. Each server isolates domains (e.g., Brain, HR, Scheduler, Business Ops).

## LLM System & Batching
The LLM engine (`src/llm.ts`) provides unified provider routing with an integrated caching layer (`llm_cache_hit`) and persona injection.

### Batch Prompt Consolidation (Phase 28)
Routine tasks scheduled via `scheduler.json` tagged with `is_routine: true` bypass immediate individual execution. The `BatchExecutor` queues these tasks grouped by company tenant. Once a maximum batch size (`maxBatchSize: 5`) is hit, or a 5-minute window expires, the engine consolidates them into a single meta-prompt (`BatchPromptBuilder`). This single LLM call processes all queued tasks simultaneously, returning a structured JSON array. This system achieves a **~60-70% reduction** in input prompt tokens by deduplicating the large strategic system instructions.

## Scheduling Engine
Tasks are defined in `scheduler.json`. The `Scheduler` daemon (`src/scheduler.ts`) monitors Cron schedules and File Watchers.
- Routine tasks (`is_routine: true`) -> `BatchExecutor.enqueue(task)`
- Normal tasks -> `JobDelegator.delegateTask(task)`

## Storage
- **Episodic Memory**: LanceDB vector database (`.agent/lancedb`) for history and semantic RAG.
- **Semantic Graph**: NetworkX-like graph mapping entities and dependencies.

## 17. Zero-Token Operations Architecture (Phase 29)
Phase 29 introduces the Symbolic Engine, transitioning the system from token-heavy LLM deliberations to deterministic, zero-cost task executions.

### Core Components
1. **Symbolic Engine (`src/symbolic/`)**:
   - **`TaskGraph`**: A JSON-serializable workflow definition that bypasses LLM inference.
   - **Rule Engine**: Evaluates business logic and conditionals (e.g., `if deal_amount > 10000`) deterministically.
   - **Symbolic Compiler**: Ingests successful past episodes from the Brain, extracts invariants using a lightweight LLM, and compiles them into a `TaskGraph`.

## 18. Time-Series Forecasting Architecture (Phase 29)
Phase 29 introduces a dedicated `forecasting` MCP server designed to ingest historical metric data and provide future predictions to support capacity planning, node scaling, and budget management.

### Core Components
1. **Time-Series Storage**: Uses `better-sqlite3` within the `.agent/data/forecasting.db` directory. Data is stored in a structured `metrics` table with strict multi-tenant isolation via a `company` index.
2. **Statistical Modeling Engine**: Uses `simple-statistics` to run linear regressions on historical data points. It outputs predicted values over a specified horizon (in days) and includes expanding confidence bounds and R-squared confidence scoring.
3. **Integration**: The `business_ops` MCP uses the `forecast_resource_demand` tool to act as a client to the `forecasting` server, tying strategic modeling directly into the operational resource planning pipeline.

### Integration with the 4 Pillars
- **Brain Integration**: The `compile_to_symbolic` tool allows the HR Loop or Supervisor to permanently "bake" highly successful patterns into zero-token graphs.
- **Adaptive Router**: The `AdaptiveRouter` intercepts `generate` calls. If a compiled `TaskGraph` matches the intent, it executes deterministically, logging an `llm_requests_avoided` metric and reducing token costs by >40% for routine operations.
