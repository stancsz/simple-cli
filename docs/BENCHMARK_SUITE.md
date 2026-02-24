# Performance Benchmark Suite

The Simple-CLI Benchmark Suite is designed to validate the competitive advantage of Simple-CLI against other coding assistants (like Aider, Cursor, etc.) in terms of **Integration Speed**, **Token Efficiency**, and **Cost**.

## Methodology

The suite executes a set of standardized tasks (JSON definitions) against the Simple-CLI agent and compares the metrics with (simulated or real) competitor data.

### Tasks
Tasks are defined in `scripts/benchmark/tasks/*.json` and include:
- **Code Repair**: Fixing bugs in provided files.
- **Feature Addition**: Adding new functionality to existing code.
- **Research**: Investigating topics and summarizing findings.

Each task specifies:
- `prompt`: The instruction given to the agent.
- `files`: Initial file state.
- `validation`: Criteria to verify success (e.g., file content check).

### Metrics
We collect:
- **Duration**: Time taken to complete the task.
- **Tokens**: Total, Prompt, and Completion tokens used.
- **Cost**: Estimated cost based on model pricing (e.g., GPT-4o, Claude 3.5 Sonnet).
- **Success Rate**: Whether the task passed validation.

## Running the Benchmark

To run the full suite:

```bash
npx tsx scripts/benchmark/run_benchmark.ts
```

This will:
1. Execute all tasks in `scripts/benchmark/tasks/`.
2. Generate results in `benchmarks/results/latest.json`.
3. Update the dashboard data in `scripts/dashboard/public/benchmarks.json`.

## Dashboard

The results can be visualized in the Operational Dashboard:
1. Start the dashboard: `cd scripts/dashboard && npm run dev`
2. Navigate to the "Benchmark" tab.

## Adding New Tasks

Create a new JSON file in `scripts/benchmark/tasks/`:

```json
{
  "id": "new_task",
  "name": "My New Task",
  "description": "Description...",
  "prompt": "Do X...",
  "files": { "file.txt": "content" },
  "validation": {
    "type": "file_content",
    "file": "file.txt",
    "contains": ["expected output"]
  },
  "expected_tokens": 1000
}
```
