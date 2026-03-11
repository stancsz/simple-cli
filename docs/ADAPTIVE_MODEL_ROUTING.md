# Adaptive Model Routing (Phase 28)

## Overview

Adaptive Model Routing dynamically directs LLM tasks to the most cost-effective and capable model tier based on the task's complexity. Instead of relying purely on a predefined static fallback chain or sending all requests to a highly capable (and expensive) model like `gpt-4o` or `deepseek-reasoner`, the system evaluates the task and routes it accordingly.

This feature is critical for operational efficiency, especially for routine background tasks and parsing operations that do not require advanced reasoning.

## How It Works

1. **Task Interception**: When `LLM.generate` is called, the request is intercepted by the `ModelRouter` class before contacting the primary LLM provider.
2. **Hash-Based Lookup**: The router hashes the complete prompt (system + user history). It checks an in-memory routing cache to see if this exact prompt has been scored recently. This avoids paying token costs to "score" a prompt repeatedly.
3. **Complexity Scoring**: If the prompt is unclassified, the router delegates the scoring task to the `business_ops` MCP server's `score_task_complexity` tool. A lightweight model (e.g., `gemini-2.0-flash-001`) analyzes the prompt and returns:
   - A float score between 0.0 and 1.0.
   - A categorical tier: `low`, `medium`, or `high`.
4. **Dynamic Routing**: The `ModelRouter` maps the categorical tier to a specific LLM model defined in the global configuration (`src/config.ts`). It injects this configuration to the front of the fallback chain.
5. **Execution**: The underlying LLM engine processes the generation request using the strategically chosen model, and logs performance metrics.

## Configuration Options

Routing is governed by the `modelRouting` block in `mcp.json` / `config.json` via the `Config` interface in `src/config.ts`.

```json
{
  "modelRouting": {
    "enabled": true,
    "defaultTier": "medium",
    "tiers": {
      "low": "google:gemini-2.0-flash-001",
      "medium": "openai:gpt-4o",
      "high": "deepseek:deepseek-reasoner"
    }
  }
}
```

- **enabled**: Toggles adaptive routing globally. If false, the standard failover chain runs.
- **defaultTier**: If the lightweight scoring model fails or errors out, requests will default to this tier.
- **tiers**: Maps qualitative complexity levels to specific provider and model identifiers.

## Complexity Score Guidelines

The lightweight scoring model evaluates prompts using the following rubric:

- **0.0 - 0.3 (Low Tier)**: Tasks involving simple parsing, JSON formatting, data extraction, brief summarization, or retrieving factual data without extensive reasoning.
- **0.4 - 0.7 (Medium Tier)**: Standard conversational tasks, basic logical deductions, drafting simple emails, standard API tool calls.
- **0.8 - 1.0 (High Tier)**: Complex reasoning, advanced coding architecture, strategic corporate planning, deep multi-step problem solving.

## Token Savings & Metrics

To track the effectiveness of Adaptive Model Routing, two new metrics are integrated into the `Health Monitor` MCP server:

1. `llm_model_routing_hits`: Tracks the number of routing decisions made, categorized by `tier` (low, medium, high) and `cached` status (true/false).
2. `llm_cost_savings_estimated`: A rough estimation of cost savings when a prompt is routed to a `low` tier model instead of defaulting to the more expensive `defaultTier`.

By routing simple tasks to "Flash" or "Haiku" class models (which are often an order of magnitude cheaper per token than "Opus" or "Reasoner" class models), the Digital Biosphere drastically reduces its operational token spend while maintaining high capabilities where it matters most.
