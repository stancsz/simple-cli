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
