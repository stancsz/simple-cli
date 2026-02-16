# 🚀 Simple-CLI: The Digital Coworker
**Stop chatting with AI. Start deploying coworkers.**

Simple-CLI is a **Meta-Orchestrator** designed to build and manage a fleet of autonomous digital employees. It doesn't just answer questions; it coordinates specialized agents (Jules, Claude, Aider, Kimi) to execute complex, multi-threaded workflows in parallel.

## 🎯 Goal
**Simple-CLI is your Digital Coworker and Autonomous Consulting Agency.**

The goal is to evolve beyond a simple coding assistant into a fleet of **Digital Employees** that you can deploy across multiple companies. By leveraging the best-in-class models and frameworks, Simple-CLI acts as a high-leverage manager that thinks boldly, acts creatively, and executes with precision.

## 🏢 Digital Employee Framework
Simple-CLI allows you to "hire" and "equip" specialized digital workers for your projects:
*   **Persona-Driven Work (Skills)**: Define specialized roles like `LeadStrategist`, `SecurityAuditor`, or `UXResearcher` using the Skill system.
*   **Hierarchical Delegation (OpenCowork)**: Spawn sub-agents with specific namespaces and toolsets to handle complex, specialized workstreams.
*   **Autonomous Evolution (ClawJit & ClawBrain)**: Agents that self-initialize their souls based on task intent and maintain persistent memory across sessions.

## 🎥 See it in Action

**Scenario**: You ask Simple-CLI to refactor a legacy module while writing tests for it in parallel.

```text
$ simple "Refactor src/legacy.ts to functional style and write tests for it. Do this in parallel."

╭─ 🤖 Simple-CLI v0.2.9 ───────────────────────────────────────────────────────╮
│                                                                              │
│  > Plan:                                                                     │
│  1. Delegate refactoring of src/legacy.ts to DeepSeek Claude (Architect)     │
│  2. Delegate test creation to Jules (Engineer)                               │
│  3. Monitor both tasks until completion.                                     │
│                                                                              │
╰──────────────────────────────────────────────────────────────────────────────╯

✖  Delegate to Claude... [Started: Task-1049]
   ↳ Command: claude "Refactor src/legacy.ts to functional style" --async

✖  Delegate to Jules... [Started: Task-1050]
   ↳ Command: jules "Write tests for src/legacy.ts based on new design" --async

ℹ  [Supervisor] Monitoring background tasks...

   ⠋ Task-1049 (Claude): Refactoring function processData()...
   ⠋ Task-1050 (Jules):  Scaffolding src/legacy.test.ts...

✔  Task-1049 (Claude) completed. File src/legacy.ts updated.
✔  Task-1050 (Jules) completed. File src/legacy.test.ts created.

✔  Goal Achieved.
```

---

## ⚡ The Vision: Results, Not Conversations
Most AI tools trap you in a never-ending chat loop. Simple-CLI is built for **autonomous execution**.

*   **Deployable Results**: Give a high-level goal and walk away. The orchestrator handles the planning, delegation, and verification.
*   **Specialized Workforce**: Hire `Jules` for GitHub PR surgery, `DeepSeek Claude` for architectural heavy lifting, and `Aider` for rapid-fire edits.
*   **Parallel Productivity**: Run a frontend refactor and a backend test suite simultaneously. Simple-CLI manages the threads so you don't have to.
*   **Persistent Agency**: Your coworkers evolve. They remember your codebase, learn your patterns, and maintain state across sessions via the `.agent` brain.

---

## 🏗️ Architecture

### The "Manager" (Meta-Orchestrator)
The core engine runs a "Game Loop" that uses an **Asynchronous Task Manager** to maintain context and execute jobs in parallel:
1.  **Plans**: Breaks high-level goals into sub-tasks.
2.  **Delegates**: Dispatches tasks using `delegate_cli(..., async=true)`.
3.  **Monitors**: Tracks the status of background jobs via the `AsyncTaskManager`.
4.  **Reviews**: Verifies the work (files, PRs) via a Supervisor loop.

### The "Workers" (Sub-Agents)
Simple-CLI wraps powerful industry CLIs into a unified interface. **Note: We are currently migrating these to standalone MCP Servers.**
*   **Jules (`jules`)**: An autonomous agent for GitHub PRs and full-stack tasks.
*   **DeepSeek Claude (`deepseek_claude`)** *(Deprecated)*: Wraps Anthropic's Claude CLI. Transitioning to `claude-mcp`.
*   **DeepSeek Aider (`deepseek_aider`)** *(Deprecated)*: Wraps the popular `aider` CLI. Transitioning to `aider-mcp`.
*   **DeepSeek CrewAI (`deepseek_crewai`)** *(Deprecated)*: Delegates to CrewAI. Please use the `crewai` MCP server instead.
*   **DeepSeek OpenCode (`deepseek_opencode`)**: Fast, open-source model generation.

---

## 🛠️ Usage

### 1. Installation
```bash
npm install -g @stan-chen/simple-cli
```

### 2. Configuration
Create a `.env` file or export variables:
```bash
export OPENAI_API_KEY="sk-..."
export DEEPSEEK_API_KEY="sk-..."
export JULES_API_KEY="..."  # Required for Jules agent
export ANTHROPIC_API_KEY="sk-..." # Optional if using direct Claude
export GH_TOKEN="..." # For GitHub operations
```

### 3. The "Simple" Command
Run the interactive TUI. The orchestrator will act as your pair programmer.
```bash
simple "Refactor the auth system"
```

### 4. Asynchronous Delegation
You can explicitly tell the orchestrator to run tasks in parallel:
```bash
simple "Delegate the UI fix to Jules and the API tests to Aider in parallel."
```

---

## 🔌 Integrated MCP Servers

Simple-CLI extends its capabilities via the Model Context Protocol (MCP). It includes several built-in MCP servers located in `src/mcp_servers/`:

*   **CapRover (`caprover`)**: Manages CapRover deployments.
*   **Cloudflare Browser (`cloudflare_browser`)**: Web browsing capabilities via Cloudflare.
*   **Coolify (`coolify`)**: Integrates with Coolify for self-hosting.
*   **CrewAI (`crewai`)**: Orchestrates multi-agent crews (Researcher + Writer) for complex tasks.
*   **Dokploy (`dokploy`)**: Deployment automation with Dokploy.
*   **Jules (`jules`)**: Provides a bridge to the Jules API for autonomous PR creation and management.
*   **Kamal (`kamal`)**: Deploy web apps anywhere.
*   **Kimi (`kimi`)**: Integrates Kimi AI capabilities.
*   **OpenClaw (`openclaw`)**: Integrates OpenClaw skills (e.g., system tools, GitHub) into the workflow.
*   **OpenCowork (`opencowork`)**: Enables hierarchical agency by allowing the hiring and delegation of tasks to worker agents.
*   **Simple Tools (`simple_tools`)**: Core system tools for the orchestrator.

## 🧠 The `.agent` Brain
Simple-CLI persists its memory and configuration in your project:
*   **`.agent/state.json`**: The Psyche (Personality, Trust, Irritation).
*   **`.agent/tools/`**: Custom tools the agent has written for itself (`create_tool`).
*   **`.agent/learnings.json`**: Long-term memory of what works and what doesn't.

---

---

## License
MIT © [Stan Chen](https://github.com/stancsz)
