# Swarm Protocol: The Hive Mind

## Overview

The Swarm Protocol enables the orchestration of multi-agent systems where a primary agent can spawn specialized sub-agents and negotiate tasks among them. This mimics a hierarchical organizational structure (The Hive Mind).

## Architecture

The Swarm Protocol is implemented via the `swarm-server` MCP, which extends the OpenCowork architecture.

### Key Components

1.  **Swarm Server**: The central MCP server that manages agent lifecycles and negotiation.
2.  **Workers (Agents)**: Autonomous `Engine` instances with specialized roles (e.g., "QA Engineer", "Docs Writer").
3.  **Brain Integration**: All swarm activities (spawning, negotiation outcomes) are logged to the Brain for future learning.
4.  **Company Context**: Sub-agents inherit or are assigned a `company_id` to access specific client knowledge bases (RAG).

## Capabilities

### 1. Dynamic Agent Spawning

Agents can be created on-the-fly to handle specific sub-tasks.

-   **Tool**: `spawn_subagent(role, task, parent_agent_id)`
-   **Process**:
    1.  A parent agent identifies a need for a specialist.
    2.  It calls `spawn_subagent` with the desired role and task.
    3.  The server initializes a new agent with a role-specific system prompt.
    4.  The server logs the spawning event to the Brain.
    5.  The new agent ID is returned to the parent.

### 2. Task Negotiation

When multiple agents are available, tasks can be assigned based on a bidding process.

-   **Tool**: `negotiate_task(agent_ids, task_description)`
-   **Process**:
    1.  The orchestrator identifies a task and a list of candidate agents.
    2.  The server prompts each agent to provide a bid (Cost, Quality, Rationale).
    3.  Agents analyze the task against their capabilities and respond with a JSON bid.
    4.  The server evaluates bids using a weighted score: `Score = Quality - (Cost / 2)`.
    5.  The winner is selected, and the result is logged to the Brain.

## Integration Patterns

### Brain Memory
-   **Spawning**: Logs `task_type: "spawn_subagent"`.
-   **Negotiation**: Logs `task_type: "negotiate_task"` with the winner and bid details.
-   **Usage**: Future agents can query `recall_delegation_patterns` to see which agents performed best for specific task types.

### Company Context
-   Sub-agents are initialized with a `company_id`.
-   They automatically load the company's profile (Brand Voice, Docs) into their context.
-   They can use RAG tools (`query_company_context`) to retrieve client-specific information.

## Future Work

-   **Inter-Agent Chat**: Allow direct message passing between agents without server mediation.
-   **Shared Workspace**: Real-time shared file editing access control.
