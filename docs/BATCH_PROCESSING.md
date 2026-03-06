# Phase 28: Batch Prompt Consolidation

## Overview
Batch Prompt Consolidation is designed to significantly reduce API costs and optimize token consumption for routine, repetitive tasks (e.g., daily strategic scans, fleet status checks).

Rather than querying the LLM independently for each scheduled task—incurring the penalty of repeatedly sending the large system prompt and corporate context—this system groups compatible tasks and processes them within a single context window.

## Architecture
1. **Scheduler Identification**: `TaskDefinition` includes new `is_routine` and `frequency` properties. The Scheduler (`src/mcp_servers/scheduler/index.ts`) allows registering tasks specifically flagged for batch processing.
2. **Efficiency Tool**: The `execute_batch_routines` tool (in `src/mcp_servers/brain/tools/efficiency.ts`) queries the scheduler for these pending routines and actively pushes them into the global queue.
3. **Batch Orchestrator**: The `BatchExecutor` (`src/batch/batch_orchestrator.ts`) holds tasks in a queue, grouped by company/tenant isolation. Once the queue reaches `maxBatchSize` or a time window expires, it bundles them.
4. **Batch Prompt Builder**: The `BatchPromptBuilder` (`src/batch/batch_prompt_builder.ts`) compiles the multiple task prompts into a structured meta-prompt, ensuring clear task demarcation for the LLM.
5. **LLM Integration**: `src/llm.ts` leverages `generateBatched` (aliased as `batchCompletion`) to send the combined prompt, extracting distinct JSON outputs for each original task and tracking token savings metrics.

## Performance Benchmark Goals
- **Token Reduction**: Batching 5 routine tasks is projected to reduce prompt token consumption by 40-60%.
- **Cost Savings**: Significant reduction in input token costs, as the large corporate system prompts are only billed once per batch instead of N times.

## Configuration
Batching behavior is controlled via standard configuration:
```json
{
  "batching": {
    "enabled": true,
    "windowMs": 300000,
    "maxBatchSize": 5,
    "supportedTypes": ["strategic_scan", "performance_metrics", "market_analysis"]
  }
}
```
