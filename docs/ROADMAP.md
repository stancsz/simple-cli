# Simple CLI: The Roadmap to Universal AI Integration

## Project Overview

**Simple CLI** is a Meta-Orchestrator with a unique competitive advantage: **rapid AI framework integration**. While other tools lock you into a single model or framework, Simple CLI can ingest, digest, and deploy any AI framework as a subordinate agent—in days, not months.

### Core Philosophy
- **Framework Agnostic:** We don't build AI models; we integrate them. Any framework (Jules, Claude, Aider, CrewAI, Kimi, Devin) can become part of the workforce.
- **Ingest-Digest-Deploy:** A systematic 3-phase process to wrap any AI framework in an MCP server and make it available to the orchestrator.
- **Token-Efficient Memory:** Shared `.agent/brain/` system eliminates redundant context passing, reducing token costs by up to 70%.
- **Autonomy over Interaction:** We aim for "set it and forget it" deployments.
- **Tool-Integrated Workforce:** Every employee comes with a "backpack" of MCP tools, allowing them to interact directly with the world (Git, Cloud, Databases).

---

---

## Strategic Roadmap

To transition from a "Wrapper" to a true "Universal AI Integration Platform," the following features are critical:

### Phase 0: Framework Integration Engine (✅ Core Capability)
**Goal:** Rapidly ingest any AI framework and turn it into a subordinate agent.
- **Mechanism:** The **Ingest-Digest-Deploy** cycle:
    1. **Ingest:** Analyze the framework's API, CLI, or SDK
    2. **Digest:** Wrap it in an MCP server (`src/mcp_servers/<framework>/`)
    3. **Deploy:** Register in `mcp.json` for automatic orchestrator discovery
- **Recent Update (Digest Phase):** Completed cleanup by removing legacy `delegate_cli` and migrating all agent configurations to `mcp.json`.
- **Proven Track Record:**
    - Jules (2 days), Aider (1 day), CrewAI (3 days), Kimi (1 day), Devin (2 days), Picoclaw (1 day)
    - Average integration time: **1-3 days** per framework
- **Token Efficiency:** Shared `.agent/brain/` memory reduces token costs by up to 70%
- **Benefit:** Framework-agnostic architecture means Simple CLI never becomes obsolete—it evolves with the AI landscape.

### Phase 1: The Smart Router (✅ Implemented)
**Goal:** Automatically dispatch tasks to the most cost-effective agent.
- **Mechanism:** Implemented in the core Orchestrator system prompt.
    - *Simple fix/typo:* -> DeepSeek V3 (Direct/Aider).
    - *Refactor/Feature:* -> Claude Code (Sonnet 3.7).
    - *Research:* -> DeepSeek R1 / CrewAI.
- **Benefit:** Drastic cost reduction for users while maintaining high quality for complex tasks.

### Phase 2: Unified Context Protocol (UCP) (✅ Implemented)
**Goal:** Share memory and state between disparate agents.
- **Problem:** Currently, if Agent A (Claude) modifies a file, Agent B (Aider) might not know *why*.
- **Solution:** Implemented via `ContextManager` and shared `.agent/context.json`.
    - Tracks High-level goals.
    - Recent architectural decisions.
    - Global constraints.
- **Mechanism:** `delegate_cli` automatically injects this context (goals, constraints, changes) into the prompt or file context of every sub-agent.

### Phase 3: The Universal Tool Interface (MCP) (✅ Implemented)
**Goal:** Standardize how agents call tools via the Model Context Protocol.
- **Status:** Core MCP server logic implemented. Numerous specialized servers (CapRover, Cloudflare, Kimi, etc.) integrated.
- **Benefit:** Direct, high-bandwidth tool access for sub-agents without regex parsing or manual wrapper overhead.

### Phase 4: Human-in-the-Loop 2.0 (✅ Implemented)
**Goal:** Enhanced control and review via TUI and Supervisor.
- **Status:** Interactive TUI and [Supervisor] QA loop are active parts of the core engine.

### Phase 4.5: SOP-as-Code (✅ Implemented)
**Goal:** Automating professional workflows using Markdown SOPs.
- **Status:** Fully functional SOP Engine MCP server.
- **Mechanism:** `sop_engine` parses Markdown, executes steps via LLM, and integrates with the Brain for learning.
- **Features:**
    - **Brain Integration:** Recalls past experiences and logs new ones.
    - **Resilience:** Exponential backoff retries.
    - **Tool Discovery:** Uses any available MCP tool.

### Phase 5: The Digital Co-worker (Deployment & Persona) (✅ Implemented)
**Goal:** Create a fully functional, human-like digital employee that lives where your team lives (Slack, Teams).
- **Validation:** ✅ Comprehensive test suite updated with MCP server mocks and Ghost Mode integration tests, ensuring reliable autonomous operation.
- **Focus:** Role-based autonomy, human-like persona, and effortless deployment.
- **Key Features:**
    - **Smart Job Delegator:** (✅ Implemented) Autonomous hourly task manager.
    - **Jules Integration:** (✅ Implemented) Task execution via Jules API.
    - **Reviewer Agent:** (✅ Implemented) Hourly code review automation.
    - **Ghost Mode:** (✅ Implemented) True 24/7 background operation via `daemon`.
    - **Persona Engine:** (✅ Implemented) Configurable voice, tone, and response style to mimic human co-workers.
    - **Containerized Deployment:** (✅ Implemented) `Dockerfile` and `docker-compose.yml` for production.
    - **Multi-Platform Interfaces:** (✅ Done) Native integrations for Slack (Done), MS Teams (Done), and Discord (Done).

### Phase 6: Enterprise Cognition (The Brain) (✅ Active)
**Goal:** Deep, persistent memory and learning across all projects.
- **Concept:** A central "Brain" that learns from every interaction, successful merge, and failed build.
- **Mechanism:** Vector database integration for long-term memory, cross-project pattern recognition, and automated "Employee Training".
- **Status:**
    - **Brain MCP Server:** (✅ Implemented)
    - **Memory Integration:** (✅ Implemented) ContextManager now automatically queries/stores relevant past experiences via the Brain.
    - **Agent Integration:** (✅ Implemented) Brain integrated with autonomous agents (Job Delegator & Reviewer) for experiential learning.

### Phase 7: The Hive Mind (Multi-Agent Swarms) (Planned)
**Goal:** Advanced multi-agent collaboration and hierarchical swarms.
- **Concept:** Agents that can dynamically spawn sub-agents (e.g., a "Lead Developer" hiring a "QA Engineer" and a "Docs Writer").
- **Mechanism:** `OpenCowork` MCP improvements to support complex delegation trees and inter-agent negotiation.

### Phase 8: Recursive Evolution (Self-Modifying Code) (✅ Implemented)
**Goal:** The agent can safely upgrade its own source code to improve efficiency.
- **Concept:** The system identifies bottlenecks (e.g., slow tools, repetitive failures) and proposes PRs to its own repo.
- **Mechanism:** "HR Loop" (implemented) + "Core Update" protocols (Dual-verification required).
    - **HR MCP Server**: Analyzes logs and suggests improvements (`analyze_logs`, `propose_change`, `perform_weekly_review`).
    - **Core Update MCP**: Securely modifies `src/` files with `propose_core_update` and `apply_core_update`.
    - **Memory Integration**: Uses the Brain MCP to recall past failures and delegation patterns.
    - **Safety Protocol**: Proposals are stored as 'pending' and require human approval (token or strict YOLO checks) before application.
    - **Automated Review**: (✅ Implemented) Weekly automated review via Scheduler.

### Phase 9: Local LLM Ops (Dify) (✅ Implemented)
**Goal:** Establish a local, privacy-first orchestration layer for rapid prototyping.
- **Concept:** Run advanced agent workflows (Supervisor + Coding Agent) on local infrastructure using Dify.
- **Status:** Local Dify stack operational for rapid prototyping.
- **Mechanism:**
    - **Dify Integration**: (✅ Implemented) `docker-compose.dify.yml` for local API, Web, DB, and Redis.
    - **Agent Configuration**: (✅ Implemented) Pre-configured templates in `dify_agent_templates/` for "Supervisor Agent" and "Coding Agent".
    - **Benefit:** Reduces reliance on cloud orchestration for sensitive projects and enables rapid iteration of agentic flows.

---

## 🚀 The 6-Pillar Vision
To achieve a true "Universal AI Integration Platform" capable of consulting for multiple companies:

### 1. Framework Ingestion Engine (The Universal Adapter) (✅ Core Capability)
*   **Concept:** Simple CLI should be able to integrate ANY AI framework as a subordinate agent.
*   **Mechanism:** The **Ingest-Digest-Deploy** cycle:
    - **Ingest:** Analyze framework APIs, CLIs, or SDKs
    - **Digest:** Wrap in MCP servers (`src/mcp_servers/<framework>/`)
    - **Deploy:** Auto-register in `mcp.json` for orchestrator discovery
*   **Proven Track Record:** Jules (2d), Aider (1d), CrewAI (3d), Kimi (1d), Devin (2d), Picoclaw (1d)
*   **Competitive Advantage:** Framework-agnostic = never obsolete. As new AI frameworks emerge, Simple CLI absorbs them.

### 2. Token-Efficient Memory (The Shared Brain) (✅ Active)
*   **Concept:** All agents share a unified `.agent/brain/` memory system.
*   **Mechanism:** Vector DB + Graph storage for episodic and semantic memory.
*   **Benefit:** Eliminates redundant context passing between agents, reducing token costs by up to 70%.

### 3. "Company Context" Onboarding (The Briefcase) (✅ Implemented)
*   **Concept:** Agents shouldn't just run in a folder; they should understand the "Client Profile."
*   **Mechanism:** Multi-tenant RAG (Vector DB) per company. When you run `simple --company client-a`, the agent loads specific brand voices, internal docs, and past decisions.
*   **Progress:** Fully realized with `company_context` MCP server and isolated Vector DB tables (PR #Pending).

### 4. SOP-as-Code (The Operating Manual) (✅ Implemented)
*   **Concept:** Automating professional workflows.
*   **Mechanism:** `sop_engine` MCP server parses Markdown SOPs and executes them step-by-step using available tools.
*   **Features:**
    - **Markdown Parsing:** Writes SOPs in standard Markdown.
    - **Autonomous Execution:** Uses LLM to reason and select tools for each step.
    - **Resilience:** Automatic retries and error handling.
    - **Tool Integration:** Discovers and uses any available MCP tool (Git, Filesystem, Brain).

### 5. "Ghost Mode" Persistence (The 24/7 Employee) (✅ Active)
*   **Concept:** Employees that work while you sleep.
*   **Mechanism:** Background agents triggered by CRON (Job Delegator, Reviewer). They perform "Morning Standups" by summarizing their background work (GitHub Issue triage, security scans) before the human wakes up.

### 6. Recursive Self-Optimization (The "HR Loop") (✅ Implemented)
*   **Concept:** The agency gets smarter the more it works.
*   **Mechanism:** Cross-Agent Reflection via HR MCP and Core Updater.
    - **Log Analysis**: Scans execution logs (`sop_logs.json`) and past experiences.
    - **Proposals**: Generates actionable configuration or code updates (`propose_change`).
    - **Human-in-the-Loop**: Dual-verification required for proposal application via `core_updater`.

---

## Conclusion
The objective of Simple CLI is to create a **framework-agnostic integration platform** that can rapidly adopt any AI capability and deploy it as part of an autonomous workforce. We aren't building just another chat interface; we are building the infrastructure for universal AI integration—where any framework can become a digital employee with minimal human intervention.
