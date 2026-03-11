# Phase 28: Adaptive Model Routing

## Overview

Adaptive Model Routing dynamically directs Large Language Model (LLM) requests to the most appropriate model based on task complexity. By evaluating a prompt's complexity before execution, routine and straightforward tasks are sent to faster, more cost-effective models (like Claude 3 Haiku), while high-complexity, strategic reasoning tasks remain on flagship models (like Claude 3 Opus or DeepSeek Reasoner).

This feature completes Phase 28: Operational Efficiency & Cost Optimization, significantly reducing API costs while maintaining system intelligence where it matters.

## Components

1.  **Complexity Evaluator (`src/mcp_servers/business_ops/tools/adaptive_routing.ts`)**
    *   Exposes `evaluate_task_complexity` and `score_task_complexity` tools in the Business Ops MCP server.
    *   Uses a fast, low-cost model (or a resilient heuristic fallback measuring prompt length and keyword density) to assign a complexity score from 1 to 10.
    *   Recommends a target model class (e.g., `claude-3-haiku-20240307` for 1-4, `claude-3-opus-20240229` for 8-10).

2.  **Adaptive Router Client (`src/llm/router.ts`)**
    *   Extends the base `LLM` class to seamlessly intercept `generate()` calls.
    *   Caches evaluation decisions using the `LLMCache` framework to prevent recurring overhead on repetitive prompts.
    *   Retrieves task complexity via MCP connection to `business_ops`.
    *   Dynamically instantiates a target model connection with routing explicitly disabled to prevent recursion.
    *   Provides fallback mechanisms if the evaluation or routing configuration fails.

3.  **Configuration Schema (`src/config.ts`)**
    *   Adds `routing` options to `.agent/config.json`:
        *   `enabled`: Toggle for adaptive routing.
        *   `defaultModel`: Fallback model.
        *   `modelMap`: Dictionary mapping recommended generic model names to specific provider implementations/deployments.
        *   `costProfiles`: Estimation map mapping model names to their cost per million tokens to calculate savings.

4.  **Metrics Integration (`src/logger.js`)**
    *   Logs the selected model (`llm_router_model_selected`).
    *   Logs the assessed complexity (`llm_router_complexity_score`).
    *   Calculates and logs estimated cost savings (`llm_cost_savings_estimated`) based on routing profiles.

## Usage

Routing is transparent to the rest of the application. It is enabled globally via configuration:

```json
{
  "routing": {
    "enabled": true,
    "defaultModel": "claude-3-5-sonnet-latest",
    "modelMap": {
      "claude-3-haiku-20240307": "anthropic:claude-3-haiku-20240307"
    },
    "costProfiles": {
      "claude-3-opus-20240229": 15.0,
      "claude-3-haiku-20240307": 0.25
    }
  }
}
```

When specific tasks (like recursive LLM calls or internal system prompts) need to bypass routing, the `disableRouting = true` flag can be set directly on the `LLM` instance.

## Validation

The system is fully validated via integration tests:

*   **Test File**: `tests/integration/adaptive_routing_validation.test.ts`
*   **Coverage**:
    *   Heuristic fallback behavior on complex vs. simple prompts.
    *   Bypass mechanisms via configuration and instance flags.
    *   Intercept, routing, and proper metric generation during live execution.