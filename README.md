<div align="center">
  <img src="docs/assets/logo.jpeg" alt="Simple Biosphere Logo" width="200"/>
  <br>
  <h3><a href="https://stan-chen.github.io/simple-cli/">🌐 Documentation Website</a></h3>
</div>

# 🚀 Simple Biosphere: The Technical Constitution of the Digital Biosphere
**A self-correcting system that consumes environmental data to optimize its own existence.**

Simple Biosphere is an **Organism**, not just a tool. It is designed to decouple system scale from human cognitive load by architecting the evolutionary constraints within which software builds itself.

**[👉 Read the Mission Statement](MISSION.md)**

## 📚 Getting Started

### ⚡ First 5 Minutes: The Interactive Tour
Want to see the magic before you configure anything? Run the Quick Start wizard:

```bash
simple quick-start
```

This interactive demo will:
-   Show you how the orchestrator delegates tasks to **Aider**, **CrewAI**, and **v0.dev**.
-   Let you peek under the hood at the raw **MCP communication**.
-   Generate a personalized configuration for your project.

**[👉 Read the Quick Start Guide](docs/QUICK_START.md)**

### Full Setup
Ready to build your digital agency?
**[👉 Read the Comprehensive Getting Started Guide](docs/GETTING_STARTED.md)**

### Advanced Guides
Ready for production? Check out our real-world deployment playbooks:
- **[Startup MVP Playbook](docs/deployment/startup_mvp.md)**: From zero to k8s in a weekend.
- **[Enterprise Migration Playbook](docs/deployment/ENTERPRISE_MIGRATION_PLAYBOOK.md)**: Modernize legacy monoliths with zero downtime.

## 🎯 Core Strength
**Simple Biosphere is a Framework-Agnostic Integration Engine.**

Unlike traditional AI tools that lock you into a single model or framework, Simple Biosphere is designed to:
- ✅ **Ingest any AI framework** in hours, not weeks
- ✅ **Digest and standardize** via MCP (Model Context Protocol) servers
- ✅ **Deploy as subordinate agents** with shared memory and context
- ✅ **Optimize token usage** through smart routing and persistent memory
- ✅ **Scale infinitely** by adding new frameworks as they emerge

**The Vision:** A digital consulting agency that can adopt any new AI capability and make it an integral part of your workforce—fast, cheap, and with perfect memory.

## 🏢 Digital Employee Framework
Simple Biosphere allows you to "hire" and "equip" specialized digital workers for your projects:
*   **Persona-Driven Work (Skills)**: Define specialized roles like `LeadStrategist`, `SecurityAuditor`, or `UXResearcher` using the Skill system.
*   **Hierarchical Delegation (OpenCowork)**: Spawn sub-agents with specific namespaces and toolsets to handle complex, specialized workstreams.
*   **Autonomous Evolution (ClawJit & ClawBrain)**: Agents that self-initialize their souls based on task intent and maintain persistent memory across sessions.

## 📊 Performance Benchmarks

We prove our claims with data. The [Simple Biosphere Performance Dashboard](https://stan-chen.github.io/simple-cli/benchmarks/dashboard/) tracks our speed, efficiency, and cost against direct usage of other frameworks.

| Metric | Simple Biosphere | Direct Usage | Benefit |
| :--- | :--- | :--- | :--- |
| **Integration Speed** | **< 2 min** | Hours/Days | **98% Faster** (Ingest-Digest-Deploy) |
| **Context Efficiency** | **~2% of Repo** | 100% of Repo | **98% Token Savings** (Shared Brain) |
| **Research Cost** | **$0.05** | $0.20+ | **75% Cheaper** (No redundant context) |

**[👉 View the Live Benchmark Dashboard](benchmarks/dashboard/index.html)**

## 🎥 See it in Action

**Scenario**: You ask Simple Biosphere to refactor a legacy module while writing tests for it in parallel.

```text
$ simple "Refactor src/legacy.ts to functional style and write tests for it. Do this in parallel."

╭─ 🤖 Simple Biosphere v0.2.8 ───────────────────────────────────────────────────────╮
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

## 🚀 Try It Now: The Digital Agency

Don't just take our word for it. Run the **Showcase Corp Demo** to see the full "Digital Agency" capability in action. Watch as the agent ingests a company context, executes a project initialization SOP, and runs autonomous maintenance loops—all in a simulated 24-hour cycle.

**[👉 View the Live Demo Documentation](docs/SHOWCASE_DEMO.md)**

```bash
# Run the simulation immediately
npm run demo
```

---

## 🔄 The Ingest-Digest-Deploy Cycle

Simple Biosphere's secret weapon is its ability to **rapidly integrate any AI framework** using a three-phase process:

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
Most AI tools trap you in a never-ending chat loop. Simple Biosphere is built for **autonomous execution**.

*   **Deployable Results**: Give a high-level goal and walk away. The orchestrator handles the planning, delegation, and verification.
*   **Specialized Workforce**: Hire `Jules` for GitHub PR surgery, `DeepSeek Claude` for architectural heavy lifting, and `Aider` for rapid-fire edits.
*   **Ghost Mode**: Your digital co-workers run 24/7. The `Smart Job Delegator` wakes up hourly to check the Roadmap and assign tasks while you sleep.
*   **Recursive Optimization**: The system performs weekly automated HR reviews to analyze logs and propose self-improvements.
*   **The Brain**: Hybrid Memory Architecture (Vector + Graph) ensures your agents remember past solutions, user preferences, and project context forever.
*   **Parallel Productivity**: Run a frontend refactor and a backend test suite simultaneously. Simple Biosphere manages the threads so you don't have to.

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
Simple Biosphere wraps powerful industry CLIs into a unified interface via **MCP Servers**:
*   **Jules (`jules`)**: An autonomous agent for GitHub PRs and full-stack tasks.
*   **Claude (`claude`)**: Wraps Anthropic's Claude for architectural reasoning.
*   **Aider (`aider`)**: Wraps the popular `aider` CLI for rapid code editing.
*   **CrewAI (`crewai`)**: Orchestrates multi-agent research crews.

---

## 🛠️ Usage

### 1. Installation
```bash
npm install -g @stan-chen/simple-biosphere
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

Simple Biosphere extends its capabilities via the Model Context Protocol (MCP). It includes several built-in MCP servers located in `src/mcp_servers/`:

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
Simple Biosphere persists its memory and configuration in your project:
*   **`.agent/state.json`**: The Psyche (Personality, Trust, Irritation).
*   **`.agent/brain/`**: The Core Memory (Vector DB + Graph) managed by the Brain MCP server.
*   **`.agent/learnings.json`**: Long-term memory of what works and what doesn't.

---

---

## License
MIT © [Stan Chen](https://github.com/stancsz)
