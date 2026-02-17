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
- **Proven Track Record:**
    - Jules (2 days), Aider (1 day), CrewAI (3 days), Kimi (1 day), Devin (2 days)
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

### Phase 5: The Digital Co-worker (Deployment & Persona) (🔄 In Progress)
**Goal:** Create a fully functional, human-like digital employee that lives where your team lives (Slack, Teams).
- **Focus:** Role-based autonomy, human-like persona, and effortless deployment.
- **Key Features:**
    - **Smart Job Delegator:** (✅ Implemented) Autonomous hourly task manager.
    - **Jules Integration:** (✅ Implemented) Task execution via Jules API.
    - **Reviewer Agent:** (✅ Implemented) Hourly code review automation.
    - **Ghost Mode:** (✅ Implemented) True 24/7 background operation via `daemon`.
    - **Persona Engine:** (✅ Implemented) Configurable voice, tone, and response style to mimic human co-workers.
    - **Containerized Deployment:** (✅ Implemented) `Dockerfile` and `docker-compose.yml` for production.
    - **Multi-Platform Interfaces:** (🔄 In Progress) Native integrations for Slack (Done), MS Teams (Done - Feb 17), and Discord (Planned).

### Phase 6: Enterprise Cognition (The Brain) (🔄 In Progress)
**Goal:** Deep, persistent memory and learning across all projects.
- **Concept:** A central "Brain" that learns from every interaction, successful merge, and failed build.
- **Mechanism:** Vector database integration for long-term memory, cross-project pattern recognition, and automated "Employee Training".
- **Status:**
    - **Brain MCP Server:** (✅ Implemented)
    - **Memory Integration:** (🔄 In Progress) Ensuring all agents read/write to the Brain.

### Phase 7: The Hive Mind (Multi-Agent Swarms) (Planned)
**Goal:** Advanced multi-agent collaboration and hierarchical swarms.
- **Concept:** Agents that can dynamically spawn sub-agents (e.g., a "Lead Developer" hiring a "QA Engineer" and a "Docs Writer").
- **Mechanism:** `OpenCowork` MCP improvements to support complex delegation trees and inter-agent negotiation.

### Phase 8: Recursive Evolution (Self-Modifying Code) (Planned)
**Goal:** The agent can safely upgrade its own source code to improve efficiency.
- **Concept:** The system identifies bottlenecks (e.g., slow tools, repetitive failures) and proposes PRs to its own repo.
- **Mechanism:** "HR Loop" (implemented) + "Core Update" protocols (Dual-verification required).

---

## 🚀 The 6-Pillar Vision
To achieve a true "Universal AI Integration Platform" capable of consulting for multiple companies:

### 1. Framework Ingestion Engine (The Universal Adapter) (✅ Core Capability)
*   **Concept:** Simple CLI should be able to integrate ANY AI framework as a subordinate agent.
*   **Mechanism:** The **Ingest-Digest-Deploy** cycle:
    - **Ingest:** Analyze framework APIs, CLIs, or SDKs
    - **Digest:** Wrap in MCP servers (`src/mcp_servers/<framework>/`)
    - **Deploy:** Auto-register in `mcp.json` for orchestrator discovery
*   **Proven Track Record:** Jules (2d), Aider (1d), CrewAI (3d), Kimi (1d), Devin (2d)
*   **Competitive Advantage:** Framework-agnostic = never obsolete. As new AI frameworks emerge, Simple CLI absorbs them.

### 2. Token-Efficient Memory (The Shared Brain) (✅ Active)
*   **Concept:** All agents share a unified `.agent/brain/` memory system.
*   **Mechanism:** Vector DB + Graph storage for episodic and semantic memory.
*   **Benefit:** Eliminates redundant context passing between agents, reducing token costs by up to 70%.

### 3. "Company Context" Onboarding (The Briefcase)
*   **Concept:** Agents shouldn't just run in a folder; they should understand the "Client Profile."
*   **Mechanism:** Multi-tenant RAG (Vector DB) per company. When you run `simple --company client-a`, the agent loads specific brand voices, internal docs, and past decisions.

### 4. SOP-as-Code (The Operating Manual)
*   **Concept:** Automating professional workflows.
*   **Mechanism:** Workflow agents that take an SOP (Standard Operating Procedure) and execute it autonomously—from scraping market data to writing a PR review script.

### 5. "Ghost Mode" Persistence (The 24/7 Employee) (✅ Active)
*   **Concept:** Employees that work while you sleep.
*   **Mechanism:** Background agents triggered by CRON (Job Delegator, Reviewer). They perform "Morning Standups" by summarizing their background work (GitHub Issue triage, security scans) before the human wakes up.

### 6. Recursive Self-Optimization (The "HR Loop")
*   **Concept:** The agency gets smarter the more it works.
*   **Mechanism:** Cross-Agent Reflection. A "Manager" agent reviews the logs of "Worker" agents and updates their `AGENT.md` (soul) to fix recurring mistakes or adopt better coding patterns.

---

## Conclusion
The objective of Simple CLI is to create a **framework-agnostic integration platform** that can rapidly adopt any AI capability and deploy it as part of an autonomous workforce. We aren't building just another chat interface; we are building the infrastructure for universal AI integration—where any framework can become a digital employee with minimal human intervention.
