# Sprint 1: The Awakening

**Goal:** Transition from a "CLI Wrapper" to a "Persistent Digital Entity".

This sprint focuses on solidifying the "Ghost Mode" and "Brain" integration to make the agent truly autonomous and context-aware across sessions. We aim to move beyond simple task execution to a state where the agent has a persistent identity, memory, and self-correcting capabilities.

## 🎯 Objectives

1.  **Brain Integration (The Cortex)**
    - Ensure `ContextManager` uses the `Brain` MCP server as the single source of truth for context (episodic and semantic memory).
    - Verify that all agents (Jules, Reviewer, JobDelegator) are reading from and writing to this shared memory.
    - Validate that `mcp.json` correctly configures the `brain` server by default.

2.  **Ghost Mode Stability (The Heartbeat)**
    - Ensure the `Scheduler` and `JobDelegator` run reliably in the background without user intervention.
    - Verify that the "Morning Standup" and "Weekly HR Review" tasks are being triggered and executed correctly.
    - Improve logging and error handling for background tasks to prevent silent failures.

3.  **Code Hygiene (The Molt)**
    - Remove all legacy wrappers and shims (e.g., `delegate_cli`, `simple_tools`) to force the use of standardized MCP tools.
    - Delete any remaining deprecated agent files (`src/agents/*.ts`) if they still exist.
    - Ensure `src/builtins.ts` only contains necessary, non-deprecated logic.

4.  **Reviewer Agent (The Conscience)**
    - Verify that the `Reviewer` agent is functional and providing valuable feedback on recent activities.
    - Ensure it can access the logs and memory needed to perform its review.

## 📝 Key Deliverables

- [ ] **Core**: `src/builtins.ts` cleaned up (remove `delegate_cli`).
- [ ] **Config**: `mcp.json` verified for `brain` server.
- [ ] **Docs**: Updated `README.md`, `ROADMAP.md`, and `todo.md` to reflect the new direction.
- [ ] **Verification**: A successful run of the "Morning Standup" task using the new architecture.

## 📅 Timeline

- **Start Date**: Immediate
- **End Date**: 2 weeks from start

## 🔗 Related Documents

- [Roadmap](../ROADMAP.md)
- [Specs](../specs.md)
- [Todo](../todo.md)
