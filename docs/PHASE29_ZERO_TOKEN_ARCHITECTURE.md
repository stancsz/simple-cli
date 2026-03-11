# Phase 29: Zero-Token Operations Architecture

## Overview
Phase 29 introduces the **Zero-Token Operations Architecture**, an evolution beyond LLM caching and adaptive routing. It shifts the paradigm from deliberative, token-heavy LLM calls to pre-compiled, deterministic, and nearly zero-cost symbolic executions.

By analyzing thousands of operational cycles, the system identifies repeatable successful patterns (e.g., client onboarding, data extraction, reporting). The Symbolic Engine compiles these learned patterns into deterministic `TaskGraphs`, utilizing a Rule Engine for lightweight decision-making.

## Core Components

### 1. The Symbolic Engine (`src/symbolic/`)
The Symbolic Engine acts as the deterministic counterpart to the probabilistic LLM.

*   **`TaskGraph` Schema (`src/symbolic/task_graph.ts`)**:
    A JSON-serializable representation of a workflow. It defines nodes (tool calls, rule evaluations, data transformations) and edges (control flow based on rule outcomes). It completely bypasses LLM inference.
*   **Rule Engine (`src/symbolic/rule_engine.ts`)**:
    Evaluates business logic natively. It processes conditionals such as `if deal_amount > 10000 then route_to="tier_2_support"` using simple, safe evaluators without invoking an LLM.
*   **Symbolic Compiler (`src/symbolic/compiler.ts`)**:
    The bridge between episodic memory and deterministic execution.
    - **Ingest**: Queries the Brain for past episodes marked as successful for a given task type.
    - **Abstract**: Uses a fast, lightweight LLM (e.g., Haiku) to extract invariant steps and tool sequences.
    - **Compile**: Transforms the abstract steps into an executable `TaskGraph`.

### 2. Adaptive Router Integration (`src/llm/router.ts`)
The `AdaptiveRouter` is enhanced to serve as the gateway to the Symbolic Engine.
- Before evaluating task complexity or calling an LLM, the Router checks if a compiled `TaskGraph` exists for the given intent.
- If a match is found, the Router executes the `TaskGraph` natively, effectively reducing the token cost for that request to zero.
- It logs a new metric: `llm_requests_avoided`.

### 3. Brain MCP Integration (`src/mcp_servers/brain/tools/`)
- **`compile_to_symbolic` Tool**: Added to the Brain MCP. This allows the HR Loop or Supervisor agents to proactively "bake" highly successful, repetitive SOPs or negotiation patterns into zero-token TaskGraphs.

## Migration Strategy (LLM-Heavy to LLM-Light)
1. **Identification**: The HR Loop identifies highly frequent, low-variance tasks (e.g., routine data fetching, standard onboarding).
2. **Compilation**: The HR Loop calls `compile_to_symbolic` passing the relevant episode IDs. The Compiler generates a `TaskGraph` and stores it in the Brain's semantic graph or a dedicated cache.
3. **Execution**: Subsequent requests matching the intent hit the `AdaptiveRouter`. The Router intercepts the request, executes the `TaskGraph` via the Rule Engine, and returns the deterministic result.
4. **Fallback**: If the Rule Engine encounters an unknown state or exception, execution gracefully falls back to the standard LLM routing pool.

## Target Metrics
- **Token Reduction**: >40% reduction in LLM tokens for routine operations.
- **Latency**: Near-instantaneous execution for compiled workflows.
- **Reliability**: 100% deterministic execution for standardized processes.
