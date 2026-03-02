# Batch Prompt Consolidation

Batch Prompt Consolidation allows the simple-biosphere system to intelligently bundle multiple autonomous agent tasks into a single LLM API request. By executing multiple tasks simultaneously within the same context window, the system drastically reduces overhead token consumption (system prompts, history) and improves overall operational efficiency.

## Core Design

The solution is driven by the `PromptBatcher` (`src/llm/batching.ts`).

1. **Interception**: When the Scheduler (`src/scheduler/trigger.ts`) receives a task triggered via node-cron or file watch, it inspects the `TaskDefinition` for the `batchingGroup` property.
2. **Queuing**: If the task has a `batchingGroup` (and is a prompt-based task), it is deferred and added to a memory queue inside the `PromptBatcher`.
3. **Delay Timer**: The first task added to an empty queue initiates a delay timer (default: 30 seconds). Additional tasks with the same `batchingGroup` are appended to the queue without extending the timer.
4. **Consolidation**: When the timer fires, the `PromptBatcher` constructs a master prompt containing all queued tasks cleanly demarcated using XML tags (`<task id="...">...</task>`).
5. **LLM Execution**: A single call is made to the `LLM` class. The LLM is instructed to respond with similarly structured XML (`<response id="...">...</response>`).
6. **Resolution**: The raw string response is parsed, and individual responses are extracted and routed back to resolve the promises of the original task executions.

## Configuration

To enable batching for a task, configure the `mcp.json` (or `scheduler.json`) by adding the `batchingGroup` attribute to an LLM task definition.

```json
{
  "id": "morning-strategic-scan",
  "name": "Morning Strategic Scan",
  "trigger": "cron",
  "schedule": "0 9 * * *",
  "prompt": "Review recent strategic developments in the AI industry and summarize key opportunities.",
  "batchingGroup": "morning_strategic_scans"
}
```

Tasks with the same `batchingGroup` that trigger within the delay window (30s) will be consolidated.

**Note:** `batchingGroup` only applies to tasks executing raw prompts. Direct action tasks (e.g., `action: "mcp.call_tool"`) bypass the batcher entirely to maintain isolated logic and context.

## Metrics & Monitoring

Batching efficiency is tracked and forwarded to the **Health Monitor MCP** (`src/mcp_servers/health_monitor/index.ts`). These metrics are integrated into the `aggregateCompanyMetrics` view and the Dashboard API.

*   `batched_prompts_total`: Number of individual tasks that were successfully consolidated into batches.
*   `tokens_saved_via_batching`: An estimated metric representing the token overhead saved by avoiding independent system prompts and request lifecycles.

## Best Practices

*   **Group Strategically**: Only group tasks that share similar execution contexts or priority levels (e.g., background daily summaries).
*   **Isolate High-Priority Tasks**: Do not assign a `batchingGroup` to time-sensitive or real-time tasks (like conversational agents or instant alerts), as the batcher inherently introduces a delay.
