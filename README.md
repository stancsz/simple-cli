# Simple-CLI ⚡

> **The terminal-native AI coding assistant that shapes itself to your task.**

[![npm version](https://img.shields.io/npm/v/@stan-chen/simple-cli)](https://www.npmjs.com/package/@stan-chen/simple-cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Simple-CLI is a **lean, autonomous AI agent** that lives in your terminal. Unlike bloated IDEs, it's built for speed, horizontal scalability, and intelligent task execution.

```bash
# Just start coding
simple

# Or jump straight to a task
simple "Build a REST API with auth"
```

**Optional:** Enable OpenClaw integration for advanced features like JIT specialization:
```bash
simple --claw "Security audit my React app"
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

```bash
# Install
npm install -g @stan-chen/simple-cli

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

## Core Workflow

### Interactive Agent Session

```bash
simple
```

When you run `simple`, you get:
1. **Codebase Understanding** - It analyzes your project structure
2. **Interactive Loop** - Ask questions, request changes, review diffs
3. **Tool Execution** - File edits, searches, command execution
4. **Autonomous Iteration** - It can loop through multi-step tasks

All with beautiful terminal UI powered by `@clack/prompts`.

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

## Real-World Usage

### Basic Interactive Mode
```bash
# Launch and chat
simple

# Direct command (one-shot)
simple "Add TypeScript to this project"
```

### Advanced: OpenClaw JIT Mode

```bash
# Generate specialized agent for code generation
simple --claw "Create a REST API with auth, rate limiting, and OpenAPI docs"

# Refactoring specialist
simple --claw "Convert class components to hooks in src/"

# Security audit expert
simple --claw "Audit for SQL injection and XSS vulnerabilities"
```

### Recurring Tasks (OpenClaw Ghost Mode)
```bash
# Auto-update dependencies weekly
npx tsx tools/claw.ts run clawGhost \
  action=schedule \
  intent="Update npm deps and test" \
  cron="0 3 * * 0"
```

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
CLAW_MODEL=gpt-4               # Model selection
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
