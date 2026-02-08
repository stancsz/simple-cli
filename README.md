<p align="center">
  <img src="assets/logo.jpeg" alt="Simple-CLI Logo" width="160"/>
</p>

# Simple-CLI ⚡

**The Project-Native AI Partner. Clean. Context-Aware. Autonomous.**

Simple-CLI is an autonomous agent that lives within your project. It uses a `.agent` folder to manage its context, skills, memory, and tools, keeping your project clean and self-contained.

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

Simple-CLI is evaluated on a suite of tasks inspired by leading agent benchmarks.

| Benchmark Suite | Focus Area | Success Rate | Status |
| :--- | :--- | :--- | :--- |
| **Terminal-Bench** | File System Operations | 66% (2/3) | 🟡 |
| **SWE-bench** | Software Engineering (Bug Fix) | 100% (1/1) | 🟢 |
| **AgentBench** | General Reasoning | 100% (1/1) | 🟢 |
| **OSWorld** | Operating System Control | 100% (1/1) | 🟢 |
| **TheAgentCompany** | Corporate Tasks | 0% (0/1) | 🔴 |

> **Comparison Context**: These benchmarks are simplified versions of standard industry tests. For reference, state-of-the-art agents (like Devin or Claude 3.5 Sonnet) typically score **15-50%** on the full, rigorous versions of these benchmarks (e.g., SWE-bench Verified). Simple-CLI is designed to be a reliable local assistant for daily tasks.

## Project Structure

*   `.agent/`: The agent's configuration and memory.
*   `examples/`: Reference personas and patterns.
*   `src/`: Core logic.

---
MIT © [Stan Chen](https://github.com/stancsz)
