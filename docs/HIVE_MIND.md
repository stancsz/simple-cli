# The Hive Mind: Multi-Agent Swarm Protocol

The Hive Mind is an advanced orchestration layer that enables **recursive agent delegation** and **multi-agent collaboration**. Unlike the standard `PersonaEngine` which changes the tone of a single agent, the Hive Mind allows an agent to spawn independent sub-agents (swarms) to solve complex problems in parallel.

## Core Concepts

### 1. Swarm Intelligence
A "Swarm" is a temporary collection of specialized agents working towards a shared goal.
- **Lead Agent**: The orchestrator (usually the user's main session or a Supervisor).
- **Worker Bee**: A specialized sub-agent (e.g., "QA Engineer", "Security Auditor").
- **Drone**: A task-specific executor (e.g., "git commit bot").

### 2. The Protocol
The Hive Mind operates on a strict protocol defined in `src/mcp_servers/hive_mind/`:
1.  **Spawn**: A tool call `spawn_sub_agent` creates a new `Engine` instance with a specific role.
2.  **Delegate**: The Lead Agent assigns a task to the sub-agent via `orchestrate_workflow`.
3.  **Execute**: The sub-agent runs autonomously, using its own tools and context.
4.  **Report**: The sub-agent returns a result (or error) to the Lead Agent.
5.  **Dissolve**: Once the task is done, the sub-agent is terminated (or cached).

### 3. Brain Integration
All swarm activities are logged to the Shared Brain (`src/mcp_servers/brain.ts`):
- **Delegation Patterns**: "Task X is usually best solved by Agent Y."
- **Success Rates**: "Agent Z failed 50% of the time on Python tasks."
- **Conflict Resolution**: "When Agent A and B disagreed, C's solution worked."

## Usage

### Spawning an Agent
```typescript
// Tool Call
use_tool("hive_mind", "spawn_sub_agent", {
  role: "React Specialist",
  task_description: "Refactor the Sidebar component to use hooks.",
  constraints: "Do not change the CSS class names."
});
```

### Orchestrating a Workflow
```typescript
// Tool Call
use_tool("hive_mind", "orchestrate_workflow", {
  steps: [
    { id: "1", description: "Audit current Sidebar code", assigned_role: "React Specialist" },
    { id: "2", description: "Write unit tests for new hooks", assigned_role: "QA Engineer" }
  ]
});
```

### Conflict Resolution
If two agents provide conflicting outputs (e.g., a "Security Auditor" rejects a "Feature Dev" PR), the Hive Mind can mediate:
```typescript
use_tool("hive_mind", "resolve_conflict", {
  agent_a_id: "dev-001",
  agent_b_id: "sec-001",
  issue: "Dev wants to use 'eval()', Security rejects it."
});
```

## Architecture

The Hive Mind is implemented as an MCP Server (`src/mcp_servers/hive_mind/`) that wraps the core `Engine` class. It maintains an in-memory registry of active agents (`HiveMindState`) and persists outcomes to LanceDB via the Brain.

## Future Improvements
- **Auctions**: Implement a bidding system where agents compete for tasks based on "token cost".
- **Reputation**: Agents gain "XP" for successful tasks, influencing future selection.
- **Persistent Swarms**: Keep high-performing teams alive across sessions.
