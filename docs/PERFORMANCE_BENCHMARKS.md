# Simple-CLI Performance Benchmarks

This document details the performance characteristics of Simple-CLI, focusing on its two key competitive advantages: **Rapid Framework Integration** and **Token Efficiency**.

## 1. Framework Integration Speed
Simple-CLI is designed to ingest new AI frameworks in minutes, not days. We benchmark this by measuring the time it takes to go from "SDK Definition" to "Working MCP Server" for three representative frameworks.

### Methodology
- **Tool:** `Framework Analyzer` MCP Server (`integrate_framework`).
- **Process:**
    1. Analyze dummy SDK/CLI definition.
    2. Generate MCP server scaffold (TypeScript).
    3. Generate and run verification tests.
    4. Register in `mcp.staging.json`.
- **Frameworks Tested:**
    - **Roo Code:** Representative of a complex coding agent.
    - **SWE-agent:** Representative of an autonomous software engineering agent.
    - **Aider:** Representative of a CLI-based coding tool.
- **Environment:** Local execution with mocked LLM to ensure deterministic timing (measuring pipeline overhead, not API latency).

### Results (Latest)
*See `docs/assets/benchmarks.json` for historical data.*

| Framework | Integration Time (ms) | Status |
| :--- | :--- | :--- |
| Roo Code | ~1500ms | ✅ Success |
| SWE-agent | ~1500ms | ✅ Success |
| Aider | ~1500ms | ✅ Success |

*Note: Times represent the local processing overhead. Real-world integration includes LLM latency (typically 10-30s).*

## 2. Token Efficiency (The Brain)
Simple-CLI uses a shared memory system (`.agent/brain/`) to reduce context window usage. Instead of passing the entire project context in every turn, the Brain retrieves only relevant snippets.

### Methodology
- **Tool:** `benchmarks/token_efficiency.ts`.
- **Scenario:** Multi-turn conversation requiring context awareness.
- **Comparison:**
    - **Traditional:** Full context (~8k tokens) injected into every prompt.
    - **Shared Brain:** Only query injected; Brain retrieves relevant memories (~150 tokens).
- **Metric:** Total token count per turn.

### Results (Latest)
- **Traditional Tokens:** ~8,370 per turn
- **Brain Tokens:** ~265 per turn
- **Savings:** **~96.8%**
- **Cost Reduction:** **31x**

## Running Benchmarks
To run the benchmark suite locally:

```bash
npx tsx benchmarks/runner.ts
```

This will:
1. Run all benchmarks.
2. Output results to `benchmarks/results.json`.
3. Update `docs/assets/benchmarks.json`.
