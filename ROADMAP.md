# Simple CLI: The Future of AI Coding Orchestration

## Project Overview

**Simple CLI** is currently positioned as a lightweight "Meta-Orchestrator" for AI coding tools. Unlike monolithic agents that attempt to solve every problem with a single model or strategy, Simple CLI acts as a force multiplier by delegating tasks to specialized sub-agents (e.g., Claude Code, Aider, custom scripts) while maintaining a unified interface.

### Core Philosophy
- **Delegation over Monolith:** Use the right tool for the job.
- **Cost Efficiency:** Leverage cheaper models (DeepSeek V3) for routine tasks and expensive models (Claude 3.7 Sonnet, DeepSeek R1) only when necessary.
- **Unified Interface:** One CLI to rule them all. The user shouldn't need to remember the syntax for five different tools.

---

## Competitive Analysis

| Feature | Simple CLI | OpenClaw / OpenDevin | Claude Code (Anthropic) | Aider |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Role** | Orchestrator / Manager | Autonomous Developer | Polished Assistant | Code Editor |
| **Model Support** | Multi-Model (via routing) | Multi-Model | Claude Only | Multi-Model |
| **Cost** | Optimized (tier-based) | High (heavy usage) | High (premium models) | Variable |
| **Complexity** | Low (Wrapper) | High (Full Sandbox) | Low (SaaS-like) | Medium (CLI) |
| **Key Strength** | Flexibility & Routing | Autonomy & Scope | UX & Reliability | Git Integration |
| **Weakness** | Dependency on others | Resource Intensive | Closed Ecosystem | UX (Command line) |

### Why Simple CLI Wins
While OpenClaw aims to *replace* the developer and Claude Code aims to be the *best* assistant, Simple CLI aims to be the **Manager**. It empowers the developer to direct a team of AI agents without getting bogged down in the details of each tool's implementation.

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

### Phase 3: The Universal Tool Interface (MCP)
**Goal:** Standardize how agents call tools.
- **Adoption:** Implement the **Model Context Protocol (MCP)**.
- **Benefit:**
    - Simple CLI can expose its own tools (e.g., specific testing scripts, database migrations) to *any* sub-agent.
    - Sub-agents can expose their capabilities back to the Orchestrator.
    - Plug-and-play compatibility with external MCP servers (e.g., Brave Search, Google Drive).

### Phase 4: Human-in-the-Loop 2.0
**Goal:** Enhanced control and review.
- **Features:**
    - **Interactive TUI:** A better terminal UI for reviewing agent plans before execution.
    - **Diff Review:** A unified diff viewer that works across all agents (even those that don't natively support it well).
    - **Undo/Redo:** A global undo stack that can revert changes made by *any* agent.

---

## Conclusion
The future of Simple CLI is not to build a better code editor than Aider or a smarter model than Claude. It is to build the **intelligence layer** that sits above them, managing context, cost, and workflow to deliver a seamless developer experience.
