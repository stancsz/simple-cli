# Simple CLI: The Roadmap to Digital Coworkers

## Project Overview

**Simple CLI** is a Meta-Orchestrator for autonomous digital employees. Unlike traditional AI tools that require constant hand-holding and chat-based guidance, Simple CLI is designed to ingest a goal, hire a specialized team, and execute until the objective is achieved.

### Core Philosophy
- **Autonomy over Interaction:** We aim for "set it and forget it" deployments.
- **Role-Based Intelligence:** Don't build one model; build an agency of specialized workers (Architects, Engineers, Researchers).
- **Tool-Integrated Workforce:** Every employee comes with a "backpack" of MCP tools, allowing them to interact directly with the world (Git, Cloud, Databases).

---

---

## Strategic Roadmap

To transition from a "Wrapper" to a true "Meta-Orchestrator," the following features are critical:

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
    - **Multi-Platform Interfaces:** (🔄 In Progress) Native integrations for Slack (Done), MS Teams (Planned), and Discord (Planned).

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

## 🚀 The 5-Pillar Vision
To achieve a true "Digital Agency" capable of consulting for multiple companies:

### 1. "Company Context" Onboarding (The Briefcase)
*   **Concept:** Agents shouldn't just run in a folder; they should understand the "Client Profile."
*   **Mechanism:** Multi-tenant RAG (Vector DB) per company. When you run `simple --company client-a`, the agent loads specific brand voices, internal docs, and past decisions.

### 2. SOP-as-Code (The Operating Manual)
*   **Concept:** Automating professional workflows.
*   **Mechanism:** Workflow agents that take an SOP (Standard Operating Procedure) and execute it autonomously—from scraping market data to writing a PR review script.

### 3. "Ghost Mode" Persistence (The 24/7 Employee) (✅ Active)
*   **Concept:** Employees that work while you sleep.
*   **Mechanism:** Background agents triggered by CRON (Job Delegator, Reviewer). They perform "Morning Standups" by summarizing their background work (GitHub Issue triage, security scans) before the human wakes up.

### 4. The Efficient Frontier (Cheap & Fast)
*   **Concept:** A super versatile framework that is cheap to run.
*   **Mechanism:**
    - **Smart Routing:** Intelligently routing simple tasks to smaller, cheaper models (Gemini Flash, Haiku) and complex reasoning to SOTA models.
    - **Serverless/Edge:** Architected to run on lightweight containers or Lambda functions to minimize infrastructure costs.

### 5. Recursive Self-Optimization (The "HR Loop")
*   **Concept:** The agency gets smarter the more it works.
*   **Mechanism:** Cross-Agent Reflection. A "Manager" agent reviews the logs of "Worker" agents and updates their `AGENT.md` (soul) to fix recurring mistakes or adopt better coding patterns.

---

## Conclusion
The objective of Simple CLI is to create a **deployable workforce**. We aren't building just another chat interface; we are building the infrastructure for autonomous agency—where AI "employees" work, learn, and deliver results with minimal human intervention.
