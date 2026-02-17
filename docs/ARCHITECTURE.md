# Architecture

Simple-CLI is designed as a **Meta-Orchestrator** that ingests various AI frameworks and deploys them as subordinate agents.

## Core Components

### 1. The Manager (Orchestrator)
The core engine (`src/engine/orchestrator.ts`) runs a game loop that:
- **Plans**: Breaks high-level goals into sub-tasks.
- **Delegates**: Dispatches tasks to specialized agents (Claude, Jules, Aider).
- **Monitors**: Tracks background jobs.
- **Reviews**: Verifies work via a Supervisor loop.

### 2. The Workers (Sub-Agents)
Agents are implemented as **MCP Servers** (`src/mcp_servers/`):
- **Jules**: Autonomous GitHub PR agent.
- **Claude**: Architectural reasoning.
- **Aider**: Rapid code editing.
- **Brain**: Persistent memory (Vector + Graph).

### 3. Interfaces (The Face)
Simple-CLI can interact with users through multiple interfaces:
- **CLI**: The primary terminal user interface (`src/cli.ts`).
- **Slack**: A Bolt.js adapter (`src/interfaces/slack.ts`) that listens for mentions and threads.
- **Microsoft Teams**: A Bot Framework adapter (`src/interfaces/teams.ts`) that acts as a Teams bot.

#### Microsoft Teams Adapter
The Teams adapter (`src/interfaces/teams.ts`) allows Simple-CLI to function as a digital co-worker in Microsoft Teams.
- **Framework**: Uses `botbuilder` (Microsoft Bot Framework v4).
- **Communication**: Listens for messages/mentions and replies with text or adaptive cards.
- **Persona**: Injects personality traits (tone, typing speed) using `PersonaEngine`.
- **State**: Manages conversation context via `TurnContext`.
- **Infrastructure**: Hosted via an Express server, compatible with Azure Bot Service.

### 4. Memory (The Brain)
- **Episodic**: Stores past experiences and task outcomes in a Vector DB (`src/brain/episodic.ts`).
- **Semantic**: Stores knowledge graph of entities and relationships (`src/brain/semantic_graph.ts`).
- **Context**: Maintains current project context and company profile (`src/brain/company_context.ts`).

## Data Flow

1. **Input**: User sends a command via CLI, Slack, or Teams.
2. **Context Loading**: System loads project context and company profile.
3. **Planning**: LLM generates a plan and selects tools/agents.
4. **Execution**:
    - **Native Tools**: Executed directly (e.g., file system).
    - **Sub-Agents**: Delegated via MCP calls.
5. **Verification**: Supervisor reviews output.
6. **Output**: Result returned to the user interface.
