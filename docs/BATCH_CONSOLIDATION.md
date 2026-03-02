# Batch Prompt Consolidation

## Overview
Phase 28 introduces the **Batch Prompt Consolidation** system to Simple-CLI. Routine tasks like strategic horizon scanning, market analysis, and performance metric checks often run sequentially and require similar context (e.g., company tenant info).

By batching these requests when they occur within the same time window (default 5 minutes), we group them into a single LLM context window.

## Architecture
- **Batch Executor (`src/scheduler/batch_executor.ts`)**: A scheduling wrapper that queues "batchable" task types. If tasks of the same type and company are scheduled within a short window, they are grouped.
- **Batch Prompt Builder (`src/llm/batch_prompt_builder.ts`)**: Constructs a single LLM prompt from multiple tasks, isolating each context and instructing the LLM to process them independently.
- **LLM Core (`src/llm.ts`)**: Now supports `generateBatched`, leveraging caching and recording saved tokens metrics.

## Performance Impact
- **Token Reduction**: Aiming for a 40-60% token reduction across overlapping routine strategic tasks.
- **Metrics**: Tracked in Health Monitor MCP (`batched_calls_count` and `tokens_saved_via_batching`).

## Configuration (`mcp.json`)
Batching can be toggled and tuned per task type.
```json
{
  "batching": {
    "enabled": true,
    "maxBatchSize": 5,
    "windowMs": 300000,
    "supportedTypes": ["strategic_scan", "performance_metrics", "market_analysis"]
  }
}
```