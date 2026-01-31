<p align="center">
  <img src="docs/assets/logo.jpeg" alt="Simple-CLI Logo" width="200"/>
</p>

# Simple-CLI ⚡

> **The terminal-native AI coding assistant that shapes itself to your task.**

[![npm version](https://img.shields.io/npm/v/@stan-chen/simple-cli)](https://www.npmjs.com/package/@stan-chen/simple-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Simple-CLI is a **lean, autonomous AI agent** that lives in your terminal. Unlike bloated IDEs, it's built for speed, horizontal scalability, and intelligent task execution.

```bash
# Interactive mode (chat loop)
simple

# One-shot execution
simple "Add TypeScript to this project"

# OpenClaw agent mode (auto-schedules background tasks)
simple --claw "Delete trash emails every hour"
```

---

## Why Simple-CLI?

⚡ **Terminal-First** - No Electron, no overhead, pure speed  
� **Autonomous Execution** - Multi-step reasoning with tool usage  
🌊 **Swarm Mode** - Horizontally scale with distributed orchestration  
🔌 **Multi-Provider** - OpenAI, Anthropic, LiteLLM - switch instantly  

**Advanced (OpenClaw Integration):**  
🧬 JIT Agent Generation - Task-specific personas via LLM  
🧠 Autonomous Memory - Persistent context across sessions  
👻 Ghost Mode - Background task scheduling  

---

## Instant Setup

### Option 1: Install from npm (Recommended)

```bash
# Install
npm install -g @stan-chen/simple-cli

# Configure
export OPENAI_API_KEY="sk-..."

# Start coding
simple
```

### Option 2: Clone from GitHub

```bash
# Clone the repository
git clone https://github.com/stancsz/simple-cli.git
cd simple-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (or use npm start for dev mode)
npm link

# Configure
export OPENAI_API_KEY="sk-..."

# Start coding
simple
```

**That's it.** It launches an interactive terminal session where you can:
- Ask questions about your codebase
- Request code changes
- Run commands and see results
- Let the agent iterate autonomously

**Optional:** Use `simple --claw "intent"` for OpenClaw JIT mode.

---

## Three Ways to Use

### 1. Interactive Mode
```bash
simple
```
Launch a chat session where you can ask questions, request changes, and see the agent iterate through multi-step tasks autonomously.

### 2. One-Shot Execution
```bash
simple "Convert this Express app to Fastify"
```
Execute a single task and exit. Perfect for scripting or quick one-off commands.

### 3. OpenClaw Agent Mode
```bash
simple --claw "Delete trash emails every hour"
```
Runs in OpenClaw-compatible environments with full access to skills, memory, and scheduling. The agent can:
- Generate specialized personas (JIT)
- Use OpenClaw skills from `skills/` directory
- **Automatically schedule recurring tasks** (e.g., "every hour" → creates ghost task)
- Persist memory across sessions

When you use `--claw`, the agent intelligently determines if your task should run:
- **Once** (immediate execution)
- **Recurring** (auto-creates scheduled background task)

---

## Advanced: OpenClaw Integration

Want specialized agents? Enable OpenClaw features with `--claw`.

### 🎯 Task-Optimized Agents

```bash
simple --claw "Migrate Express to Fastify"
```

This doesn't just "chat" - it **generates a specialized AI persona** via LLM:
- Expert migration strategist
- Framework-specific constraints
- Best practices for the exact task

Then you work with *that* agent, not a generic assistant.

### 🧠 Persistent Memory

Your agent builds knowledge over time:
```
.simple/workdir/memory/
├── notes/        # Session summaries
├── reflections/  # What it learned
├── logs/         # Full execution history
└── graph/        # Knowledge connections
```

When you return, it **remembers**. Logs auto-prune and archive.

### 👻 Background Execution

```bash
# Schedule a recurring security check
npx tsx tools/claw.ts run clawGhost \
  action=schedule \
  intent="Scan for CVEs" \
  cron="0 9 * * 1"  # Every Monday 9am
```

Uses **real OS schedulers** (Windows Task Scheduler / crontab) - not polling loops.

### 🌊 Swarm for Scale

```bash
simple --swarm tasks.json --concurrency 5
```

Distribute tasks across isolated Git worktrees:
- File-level locking
- Conflict-free merges
- Observable task queue
- Works on local machines or CI/CD

---

## Core Features

| Feature | Description |
|---------|-------------|
| **Multi-Provider** | OpenAI, Anthropic, LiteLLM - switch with `--moe` |
| **MCP Integration** | Model Context Protocol for external data sources |
| **Skills System** | Extensible via `SKILL.md` manifests |
| **Git Worktree Isolation** | Swarm agents work in separate branches |
| **Auto-Pruning Memory** | Keeps last 50 logs, archives the rest |
| **YOLO Mode** | `--yolo` for unattended execution |

---

## Real-World Examples

### Native Usage (Modes 1 & 2)

```bash
# Interactive exploration
simple
→ "What database does this app use?"
→ "Add input validation to the user registration endpoint"

# One-shot tasks
simple "Add TypeScript strict mode and fix all errors"
simple "Generate OpenAPI docs from my Express routes"
simple "Refactor to use async/await instead of callbacks"
```

### OpenClaw Mode (Mode 3)

```bash
# Immediate execution with specialized agent
simple --claw "Audit this React app for security vulnerabilities"
simple --claw "Migrate from Vue 2 to Vue 3"

# Auto-scheduled recurring tasks
simple --claw "Check for npm vulnerabilities every day at 9am"
simple --claw "Delete old log files every week"
simple --claw "Run integration tests hourly"
```

When you provide time-based language ("every hour", "daily", etc.), the `--claw` mode **automatically:**
1. Generates a specialized agent persona for the task
2. Creates a scheduled background task (Ghost Mode)
3. Registers it with your OS scheduler (crontab / Task Scheduler)

---

## Architecture

**Zero Core Disruption** - Everything is modular:

```
simple-cli/
├── src/          # Core agent logic
├── tools/        # Discoverable tool primitives
├── skills/       # OpenClaw-compatible skill packs
│   ├── claw-jit/     # JIT persona generation
│   ├── claw-brain/   # Memory management
│   └── claw-ghost/   # Task scheduling
└── .simple/      # Your workspace state
    ├── AGENT.md      # Generated persona
    └── workdir/      # Memory & artifacts
```

Built with the **Adapter Pattern** - add features without touching core.

---

## Advanced

### Environment Variables
```bash
OPENAI_API_KEY=sk-...          # Primary LLM
CLAW_MODEL=gpt-5-mini          # Model selection
LITELLM_BASE_URL=...           # Proxy support
DEBUG=true                     # Verbose logging
```

### MOE (Mixture of Experts)
```bash
simple --moe  # Routes tasks to tier-appropriate models
```

### Swarm Configuration
```json
{
  "tasks": [
    {"file": "src/auth.ts", "instruction": "Add 2FA"},
    {"file": "src/api.ts", "instruction": "Add rate limiting"}
  ],
  "concurrency": 3
}
```

---

## Documentation

- 📖 [Full Docs](docs/index.md) - Architecture, workflows, customization
- 🧬 [OpenClaw Integration](docs/claw-integration.md) - JIT, Memory, Ghost Mode
- 🌊 [Swarm Guide](docs/swarm.md) - Distributed task orchestration
- 🛠️ [Custom Skills](docs/custom-skills.md) - Build your own

---

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

**Core Principles:**
- **No bloat** - Every feature must justify its existence
- **Agent-first** - Tools serve the agent, not the UI
- **Horizontal scale** - Features should work in swarm mode
- **Zero lock-in** - Portable configs, standard formats

---

## License

MIT © [Stan Chen](https://github.com/stancsz)

---

## Acknowledgments

Built with inspiration from:
- **Gemini CLI** - Multi-provider architecture
- **OpenClaw** - Skill system design
- **Cursor/Aider** - Agentic coding patterns

Powered by:
- [@clack/prompts](https://github.com/natemoo-re/clack) - Beautiful TUI
- [LiteLLM](https://github.com/BerriAI/litellm) - Universal LLM proxy

---

<p align="center">
  <strong>Stop configuring. Start building.</strong><br>
  <code>simple "Your next big idea"</code>
</p>
