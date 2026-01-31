# Simple CLI
<p align="center">
  <img src="logo.jpeg" width="240" alt="Simple CLI Logo" />
</p>
> **小西LI巨能打** — Lean, lightweight, and packs a punch. 🥊

**Simple CLI** is the minimalist's answer to the "heavy" AI coding agents of today. While tools like Cursor or Claude Code wrap their logic in complex UIs and proprietary IDEs, **Simple CLI** stays close to the metal. 

It is the **leanest implementation** of an agentic coding assistant, designed for developers who want the power of an agentic swarm unit with a core codebase they can actually read, understand, and modify in 5 minutes.

---

## Quick Start 🚀

Get up and running in seconds. No complex configuration, no proprietary sign-ups.

```bash
# 1. Install globally
npm install -g @stan-chen/simple-cli

# 2. Set your API key (any provider supported by LiteLLM)
export OPENAI_API_KEY="sk-..."
# Works with ANTHROPIC_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, etc.

# 3. Start building
simple "Build a premium React dashboard with glassmorphism"
```

---

## Why Simple CLI? ⚡

### 🧠 Extreme Token Efficiency
Most agents blast thousands of lines of code into the LLM context. **Simple CLI** is surgical. Using structured analysis tools like `analyzeFile` (via `ts-morph`) and `listDir`, it extracts exactly what it needs to understand your codebase, keeping costs low and speed high.

### 🎨 World-Class Design Sensibilities
Built-in engineering doctrine that prioritizes visual excellence. While the CLI is minimalist, its **output** is premium. Just ask for "stunning" or "premium" and it will default to Vite, Tailwind, and modern design patterns (8px rhythm, glassmorphism, curated palettes).

### 🤖 The "Hackable" 150-Line Core
The entire orchestration loop is under **150 lines of code**. It’s not a black box; it’s a tool you can actually master. If you need a custom tool or a specific logic shift, you can change it in minutes.

---

## Use Cases: From Scripting to Swarms 🐝

### 1. The "Fire & Forget" Fix
Don't wait around. Fire a task and let the agent handle the cycle of coding, linting, and committing.
```bash
simple --yolo --auto-commit --auto-test "fix all TypeScript naming inconsistencies in src/models"
```

### 2. High-Density Agent Swarms
Simple CLI is designed to be the **standardized compute unit** of agentic coding. Spin up 50 workers to refactor a legacy codebase overnight using nothing but Git for coordination.

```python
# Programmatic orchestration in Python
import asyncio

async def run_worker(task, path):
    proc = await asyncio.create_subprocess_exec('simple', '--yolo', task, cwd=path)
    await proc.wait()

await asyncio.gather(
    run_worker("implement auth", "./services/auth"),
    run_worker("add logging", "./services/api")
)
```

---

## Comparison Table ⚖️

| Feature | Simple CLI | Aider | Claude Code | Cursor |
|---------|:-----------:|:-----:|:-----------:|:------:|
| **Maturity** | ⚠️ Alpha | ✅ Mature | ✅ Mature | ✅ Mature |
| **UX** | Minimalist | CLI-first | Polished | Full IDE |
| **Logic** | **150 LOC Core** | ~50k LOC | Proprietary | Proprietary |
| **Models** | **Any (LiteLLM)** | Many | Claude Only | Multiple |
| **Headless** | 🌟 Native | ✅ Yes | ❌ No | ❌ No |
| **MCP Protocol** | ✅ Native | ❌ No | ✅ Native | ⚠️ Limited |

---

## 🛠 Features You'll Actually Use

*   **Native Tool Integration**: Inherits your full machine environment. If you're logged into `gh`, `aws`, or `git`, the agent is too.
*   **Mix of Experts (MoE)**: Native routing to use the right model for the right task (e.g., GPT-4o for logic, GPT-4o-mini for docs).
*   **Self-Evolution**: The agent can upgrade itself by writing its own tools into `src/tools/`.
*   **Skills/Presets**: Switch personas instantly with `@code`, `@architect`, `@test`, or `@review`.

---

## 🏗 Architecture: Simplicity by Design

```text
┌─────────────────────────────────────────────────────────┐
│                    Simple CLI                           │
├─────────────────────────────────────────────────────────┤
│  LiteLLM │ simple-git │ ts-morph │ MCP Protocol │ UI    │
├─────────────────────────────────────────────────────────┤
│              Agent Core (~150 LOC)                      │
│     (Response → Tool Execution → Reflection)            │
└─────────────────────────────────────────────────────────┘
```

1. **Minimal core** - The orchestrator is human-readable.
2. **Git-native state** - No database. Git is the only source of truth.
3. **Model agnostic** - Use OpenAI, Anthropic, Gemini, or local models.
4. **Tool-first** - 12 built-in tools + unlimited MCP tools.

---

## CLI Reference 📖

```bash
# Basic Usage
simple [MESSAGE] [FLAGS]

# Common Flags
--yolo           No approval needed for tools
--auto-commit    Auto-commit after every success
--moe            Enable Mix of Experts routing
--skill=SKILL    Start with a specific skill (e.g., architect)

# Chat Commands
/add [file]      Add file to context
/diff            Show current changes
/tokens          Show usage statistics
/undo            Revert last agent move
```

---

## 🤝 Contributing & License

Simple CLI is intentionally minimal. Before opening a PR, ask yourself:
1. Does it help headless automation?
2. Can it be a tool instead of core logic?
3. **Does it keep the core under 150 lines?**

Licensed under **MIT**. Built for the swarm era. 🚀
