# The Hive Mind: Multi-Agent Architecture

## Overview
Phase 7 of the Simple CLI roadmap focuses on "The Hive Mind"—a system where agents can dynamically spawn sub-agents and negotiate tasks to solve complex problems. This document outlines the architecture and implementation details.

## Core Components

### 1. CrewAI MCP Server Extension
The `crewai-server` (`src/mcp_servers/crewai/`) has been extended to support dynamic agent creation.
- **Dynamic Spawning:** The `spawn_subagent` tool allows the orchestrator (or another agent) to define an agent's role, goal, and backstory at runtime.
- **Dynamic Execution:** The `start_crew` tool now generates a Python script on-the-fly (`.agent/crewai/generated_crew_*.py`) that instantiates the spawned agents and executes the task.
- **Negotiation:** The `negotiate_task` tool provides a basic mechanism for agents to exchange messages regarding task assignments.

### 2. OpenCowork Protocol
A new MCP server, `opencowork-server` (`src/mcp_servers/opencowork/`), has been introduced to serve as the standard for inter-agent communication.
- **Messaging:** The `send_message` tool allows agents to send direct messages to each other.
- **Future Goals:** This server will evolve to handle complex negotiation protocols (contract net protocol, auctions) and shared state management.

## Workflow
1. **Orchestrator** receives a complex request (e.g., "Build a full-stack app").
2. **Orchestrator** uses `spawn_subagent` to create a "Frontend Dev", "Backend Dev", and "QA Engineer".
3. **Orchestrator** (or the agents themselves) use `negotiate_task` or `send_message` to clarify responsibilities.
4. **Orchestrator** calls `start_crew` with the high-level task.
5. **CrewAI Server** generates a Python script with the defined agents and kicks off the process.

## Next Steps
- Implement persistent message storage (Redis) for `opencowork`.
- Enhance the negotiation protocol to support "bidding" (agents proposing cost/time).
- Allow spawned agents to recursively spawn their own sub-agents.
