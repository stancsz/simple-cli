<div align="center">
  <img src="docs/assets/logo.jpeg" alt="Simple CLI Logo" width="200"/>
</div>

# 🚀 Simple-CLI: The Universal AI Framework Integrator
**The only orchestrator that learns any AI framework and turns it into a subordinate agent.**

Simple-CLI is a **Meta-Orchestrator** with a unique superpower: **rapid framework ingestion**. Point it at any AI framework (Jules, Claude, Aider, CrewAI, Kimi, Devin), and it will digest, wrap, and deploy it as a specialized sub-agent—complete with token-efficient long-term memory and autonomous execution capabilities.

## 🎯 Core Strength
**Simple-CLI is a Framework-Agnostic Integration Engine.**

Unlike traditional AI tools that lock you into a single model or framework, Simple-CLI is designed to:
- ✅ **Ingest any AI framework** in hours, not weeks
- ✅ **Digest and standardize** via MCP (Model Context Protocol) servers
- ✅ **Deploy as subordinate agents** with shared memory and context
- ✅ **Optimize token usage** through smart routing and persistent memory
- ✅ **Scale infinitely** by adding new frameworks as they emerge

**The Vision:** A digital consulting agency that can adopt any new AI capability and make it an integral part of your workforce—fast, cheap, and with perfect memory.

## 🏢 Digital Employee Framework
Simple-CLI allows you to "hire" and "equip" specialized digital workers for your projects:
*   **Persona-Driven Work (Skills)**: Define specialized roles like `LeadStrategist`, `SecurityAuditor`, or `UXResearcher` using the Skill system.
*   **Hierarchical Delegation (OpenCowork)**: Spawn sub-agents with specific namespaces and toolsets to handle complex, specialized workstreams.
*   **Autonomous Evolution (ClawJit & ClawBrain)**: Agents that self-initialize their souls based on task intent and maintain persistent memory across sessions.

## 🎥 See it in Action

**Scenario**: You ask Simple-CLI to refactor a legacy module while writing tests for it in parallel.

```text
$ simple "Refactor src/legacy.ts to functional style and write tests for it. Do this in parallel."

╭─ 🤖 Simple-CLI v0.2.8 ───────────────────────────────────────────────────────╮
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

## 🔄 The Ingest-Digest-Deploy Cycle

Simple-CLI's secret weapon is its ability to **rapidly integrate any AI framework** using a three-phase process:

### 1️⃣ **Ingest** (Learn the Framework)
- Analyze the framework's API, CLI, or SDK
- Understand its strengths, weaknesses, and ideal use cases
- Map its capabilities to MCP tool definitions

### 2️⃣ **Digest** (Standardize the Interface)
- Wrap the framework in an MCP server (`src/mcp_servers/<framework>/`)
- Create a unified interface that the orchestrator can call
- Add framework-specific optimizations (streaming, batching, caching)

### 3️⃣ **Deploy** (Make it a Subordinate Agent)
- Register the new MCP server in `mcp.json`
- The orchestrator automatically discovers and uses it
- The framework becomes part of your digital workforce

**Examples of Integrated Frameworks:**
- **Jules** → Autonomous GitHub PR agent (ingested in 2 days)
- **Aider** → Rapid code editing specialist (ingested in 1 day)
- **CrewAI** → Multi-agent research teams (ingested in 3 days)
- **Kimi K2.5** → Deep reasoning engine (ingested in 1 day)
- **Devin** → Full-stack autonomous developer (ingested in 2 days)

**Token Efficiency:** All agents share a unified `.agent/brain/` memory system, eliminating redundant context passing and reducing token costs by up to 70%.

---

## ⚡ The Vision: Results, Not Conversations
Most AI tools trap you in a never-ending chat loop. Simple-CLI is built for **autonomous execution**.

*   **Deployable Results**: Give a high-level goal and walk away. The orchestrator handles the planning, delegation, and verification.
*   **Specialized Workforce**: Hire `Jules` for GitHub PR surgery, `DeepSeek Claude` for architectural heavy lifting, and `Aider` for rapid-fire edits.
*   **Ghost Mode**: Your digital co-workers run 24/7. The `Smart Job Delegator` wakes up hourly to check the Roadmap and assign tasks while you sleep.
*   **The Brain**: Hybrid Memory Architecture (Vector + Graph) ensures your agents remember past solutions, user preferences, and project context forever.
*   **Parallel Productivity**: Run a frontend refactor and a backend test suite simultaneously. Simple-CLI manages the threads so you don't have to.

---

## 🏗️ Architecture

### The "Manager" (Meta-Orchestrator)
The core engine runs a "Game Loop" that uses an **Asynchronous Task Manager** to maintain context and execute jobs in parallel:
1.  **Plans**: Breaks high-level goals into sub-tasks.
2.  **Delegates**: Dispatches tasks using registered MCP agents (e.g., `aider`, `claude`, `jules`).
3.  **Monitors**: Tracks the status of background jobs via the `AsyncTaskManager`.
4.  **Reviews**: Verifies the work (files, PRs) via a Supervisor loop.

### Agent Configuration
Agents are configured in `mcp.json` in the project root. This file defines the available CLI agents and their commands.

### The "Workers" (Sub-Agents)
Simple-CLI wraps powerful industry CLIs into a unified interface via **MCP Servers**:
*   **Jules (`jules`)**: An autonomous agent for GitHub PRs and full-stack tasks.
*   **Claude (`claude`)**: Wraps Anthropic's Claude for architectural reasoning.
*   **Aider (`aider`)**: Wraps the popular `aider` CLI for rapid code editing.
*   **CrewAI (`crewai`)**: Orchestrates multi-agent research crews.

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

*   **Brain (`brain`)**: Provides episodic and semantic memory via Vector DB and Graph.
*   **SOP (`sop`)**: Manages and executes Standard Operating Procedures.
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

## 🧠 The `.agent` Brain
Simple-CLI persists its memory and configuration in your project:
*   **`.agent/state.json`**: The Psyche (Personality, Trust, Irritation).
*   **`.agent/brain/`**: The Core Memory (Vector DB + Graph) managed by the Brain MCP server.
*   **`.agent/learnings.json`**: Long-term memory of what works and what doesn't.

---

---

## License
MIT © [Stan Chen](https://github.com/stancsz)
