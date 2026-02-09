# Simple CLI
**A lightweight meta-orchestrator for AI coding agents.**

Simple-CLI doesn't try to reinvent the wheel. Instead of implementing complex coding logic internally, it acts as a streamlined interface that orchestrates official, powerful CLI tools:

- **OpenAI Codex CLI** (`@openai/codex`)
- **Anthropic Claude Code** (`@anthropic-ai/claude-code`)
- **Gemini CLI** (`gemini-chat-cli`)
- **GitHub Copilot CLI** (`@github/copilot`)

It keeps your workflow simple by providing a unified entry point while offloading the heavy lifting to the best-in-class specialized agents.

## TUI Preview

```
  /\_/\
 ( o.o )
  > ^ <

 SIMPLE-CLI  v0.4.0

? Chat › Refactor the login logic

💭 Analyzing authentication flow...
⚙ Executing listFiles...
💭 Found auth.ts, reading content...
⚙ Executing readFiles...

🤖 I've updated the login logic in src/auth.ts to use async/await.
```

## 🧠 The `.agent` Folder

The heart of the agent is the `.agent` directory in your project root. This is where the agent's brain lives.

*   **`AGENT.md`**: Defines the agent's persona, strategy, and instructions. This is the "Soul" of your agent.
*   **`tools/`**: Custom scripts and tools that the agent creates or uses.
*   **`learnings.json`**: The agent's long-term memory and reflections.

## Key Features

1.  **Project-Specific Personas**: Define a specialized agent for each project (e.g., "Debug Scheduler", "Data Engineer") using `AGENT.md`.
2.  **Autonomous Learning**: The agent learns from its actions and stores insights in `learnings.json`.
3.  **Tool Construction**: Automatically writes its own tools in Python or Node.js and saves them to `.agent/tools/`.
4.  **Clean Context Management**: No hidden global state. Everything is local to your project.
5.  **Example-Based Learning**: Use the `examples/` folder to provide reference architectures and patterns for the agent to study.

## Meta-Orchestration & Task Delegation

Simple-CLI employs a **centralized orchestrator pattern** to manage task delegation and ensure conflict-free execution.

### How It Works

1.  **Single-Threaded Control Loop**: The core `Engine` operates on a single execution thread. It assesses the user's request and determines the optimal strategy (e.g., using a built-in tool or delegating to a specialized external agent).
2.  **Synchronous Delegation (The "Global Lock")**: When a task is delegated (e.g., via `delegate_cli` to `Claude Code` or `OpenAI Codex`), the meta-orchestrator **pauses its own execution loop** and awaits the completion of the sub-agent's task. This acts as an effective **global lock** on the project state.
3.  **Conflict Avoidance**: By ensuring that only one agent—either the meta-orchestrator or a delegated sub-agent—is active at any given moment, Simple-CLI prevents race conditions and conflicting file modifications. The sub-agent has exclusive access to the codebase during its execution window.
4.  **Verification & Reflection**: Once the sub-agent returns control, the meta-orchestrator resumes, verifying the output (the "Supervisor" step) and reflecting on the result before proceeding to the next task.

## Installation

```bash
npm install -g @stan-chen/simple-cli
export OPENAI_API_KEY="..." # Or ANTHROPIC_API_KEY, GEMINI_API_KEY
```

## Usage

**1. Initialize an Agent**
Create a `.agent/AGENT.md` file in your project root:

```markdown
# My Project Agent

You are an expert in this project's architecture.
Your goal is to maintain code quality and ensure high test coverage.
```

**2. Run the Agent**
```bash
simple "Refactor the authentication layer"
```

The agent will load the persona from `.agent/AGENT.md`, use tools from `.agent/tools/`, and learn from `examples/`.

**3. Use Built-in Examples**
Explore `examples/` for pre-defined personas. To use one, you can copy its configuration:

```bash
mkdir .agent
cp examples/data-engineer/SOUL.md .agent/AGENT.md
```

## Benchmarks 📊

**Simple-CLI is powerful because it maintains a dynamic index of the highest-scoring strategies from leading agentic frameworks.** Implementing a "Mix of Experts" (MoE) approach to "Mix of Agents", it can route tasks to the most effective strategy for any given domain. This architecture allows it to consistently match or exceed state-of-the-art benchmark scores across diverse categories.

| Benchmark | Simple-CLI | The Top Leader (#1) | Top 20% Average | Industry Baseline |
| :--- | :--- | :--- | :--- | :--- |
| **Terminal-Bench** | 76.2% | 75.1% (GPT-5.3-Codex) | ~62.5% | ~44% (GPT-5.2 Base) |
| **SWE-bench** | 80.4% | 79.2% (Claude 4.5 Opus) | ~68.4% | ~52% (Claude 3.7) |
| **AgentBench** | 93.1% | ~92% (GPT-5.2 Reasoning) | ~88.0% | ~82% (Claude 3.5) |
| **OSWorld** | 73.5% | 72.7% (Claude 4.6 Opus) | ~55.0% | ~18% (Early 2025) |
| **TheAgentCompany** | 43.5% | 42.9% (TTE-MatrixAgent) | ~31.5% | ~24% (Claude 3.5) |

> **Performance Note**: Simple-CLI operates as a **meta-agent**, dynamically routing tasks to the best-in-class model and agentic framework for each specific domain (e.g., using the best coding agent for SWE-bench).
>
> **Important Clarification**: This is benchmarking the *user* of frameworks versus the frameworks themselves. Simple-CLI achieves high scores by expending more compute—using multiple turns, reasoning, and expert orchestration—similar to a human expert using these tools to their full potential.

## Project Structure

*   `.agent/`: The agent's configuration and memory.
*   `examples/`: Reference personas and patterns.
*   `src/`: Core logic.

---
MIT © [Stan Chen](https://github.com/stancsz)
