# Simple CLI Benchmarks

This directory contains a benchmark suite for evaluating the Simple CLI agent on various tasks.

## Supported Benchmarks

The suite includes tasks inspired by:

1.  **Terminal-Bench**: Bash/Shell command proficiency.
2.  **TheAgentCompany**: Document processing and office tasks.
3.  **SWE-bench**: Software engineering and bug fixing.
4.  **AgentBench**: General reasoning and logic.
5.  **OSWorld**: Simulated OS operations (file manipulation).

## Prerequisites

- Node.js >= 18
- `npm install` dependencies.
- `npm run build` to compile the CLI.
- **API Keys**: The agent requires valid API keys (e.g., `OPENAI_API_KEY`) to function. Set them in your environment or `.env` file.

## Running Benchmarks

To run all benchmarks:

```bash
npx tsx tests/benchmarks/runner.ts
```

This will execute each task in a temporary directory and report Pass/Fail status.

## Adding New Benchmarks

1.  Open `tests/benchmarks/definitions.ts`.
2.  Add a new `Benchmark` object to the `benchmarks` array.
3.  Define tasks with:
    - `name`: Task name.
    - `prompt`: The instruction for the agent.
    - `setup`: (Optional) Function to prepare the environment (create files).
    - `verify`: Function to check if the task succeeded (inspect files/output).

Example:

```typescript
{
    name: 'MyNewBenchmark',
    description: 'Testing new capabilities',
    tasks: [
        {
            name: 'Write Hello',
            prompt: 'Create hello.txt with content "world"',
            verify: (cwd) => existsSync(join(cwd, 'hello.txt'))
        }
    ]
}
```

## Troubleshooting

- **Timeouts**: Tasks have a 60s timeout. If the agent gets stuck in a loop (e.g., repeated errors), it will be killed.
- **API Errors**: Ensure your API keys are valid. The runner captures stdout/stderr, which may show `litellm` errors.
