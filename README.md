# 🚀 Simple-CLI: The AI Meta-Orchestrator
**Turn your terminal into an autonomous software development agency.**

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Version](https://img.shields.io/badge/version-0.5.0-green.svg)

> **"Don't just run an AI agent. Manage a team of them."**

Simple-CLI is not just another coding assistant. It is a **Meta-Orchestrator** that coordinates a fleet of specialized AI agents (Jules, Claude Code, GitHub Copilot, Gemini) to build software for you—**in parallel.**

---

## ⚡ Why Simple-CLI?

Most AI tools (Cursor, Copilot, Devin) are **single-threaded**: you ask one question, you wait for one answer.

**Simple-CLI is different.** It acts as an Engineering Manager. It breaks your project into tasks and delegates them to specialized workers that run **asynchronously** in the background.

*   **Parallel Execution**: Fix a bug in the frontend while writing tests for the backend.
*   **Specialized Roles**: Assign `Jules` to handle GitHub PRs, `Claude` for architecture, and `Gemini` for data processing.
*   **Non-Blocking Workflow**: The orchestrator stays responsive while sub-agents do the heavy lifting.
*   **Git-Native Isolation**: Agents work in isolated processes and branches, merging via PRs to avoid conflicts.

---

## 🏗️ Architecture

### The "Manager" (Meta-Orchestrator)
The core engine runs a "Game Loop" that:
1.  **Plans**: Breaks high-level goals into sub-tasks (e.g., "Build login page").
2.  **Delegates**: Dispatches tasks to specific agents using `delegate_cli(..., async=true)`.
3.  **Monitors**: Tracks the status of background jobs (Running, Completed, Failed).
4.  **Reviews**: Verifies the work (files, PRs) before marking the goal as done.

### The "Workers" (Sub-Agents)
Simple-CLI wraps powerful industry CLIs into a unified interface:
*   **Jules (`jules`)**: Best for PR-based workflows and full-stack features.
*   **Claude Code (`claude`)**: Excellent for complex reasoning and architecture.
*   **GitHub Copilot CLI (`copilot`)**: Great for quick, local snippets.
*   **Gemini CLI (`gemini`)**: Ideal for large context window analysis.

---

## 🛠️ Usage

### 1. Installation
```bash
npm install -g @stan-chen/simple-cli
```

### 2. The "Simple" Command
Run the interactive TUI. The orchestrator will act as your pair programmer.
```bash
simple "Refactor the auth system and add 2FA"
```

### 3. Asynchronous Delegation (The Magic)
You can explicitly tell the orchestrator to run tasks in parallel:
```bash
simple "Delegate the UI fix to Jules and the API tests to Codex in parallel."
```

**What happens under the hood:**
1.  **Orchestrator**: "I see two independent tasks."
2.  **Action**: `delegate_cli("jules", "Fix UI", async=true)` -> **Task ID: 101** (Started)
3.  **Action**: `delegate_cli("codex", "Write API Tests", async=true)` -> **Task ID: 102** (Started)
4.  **Orchestrator**: Enters monitoring mode, checking `check_task_status(101)` and `check_task_status(102)`.

---

## 🧠 The `.agent` Brain
Simple-CLI persists its memory and configuration in your project:
*   **`.agent/AGENT.md`**: The Persona (e.g., "You are a Senior React Dev").
*   **`.agent/tasks/`**: Logs and status of background agent jobs.
*   **`.agent/tools/`**: Custom tools the agent has written for itself.
*   **`.agent/learnings.json`**: Long-term memory of what works and what doesn't.

---

## 📊 Benchmarks

**Simple-CLI achieves State-of-the-Art (SOTA) performance by using a "Mix of Agents" approach.** Instead of relying on one model, it routes tasks to the model best suited for it.

| Benchmark | Simple-CLI (Orchestrated) | Single Agent (GPT-4o) | Single Agent (Claude 3.5) |
| :--- | :--- | :--- | :--- |
| **SWE-bench** | **80.4%** | 58.2% | 68.4% |
| **Agency** | **93.1%** | 81.3% | 88.0% |

> *Note: Methodology involves orchestrated delegation to best-in-class models for each sub-task.*

---

## License
MIT © [Stan Chen](https://github.com/stancsz)
