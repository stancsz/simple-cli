<p align="center">
  <img src="docs/assets/logo.jpeg" alt="Simple-CLI Logo" width="160"/>
</p>

# simple-cli ⚡

The terminal-native AI coding assistant. Lean, local, and built for speed.

```bash
# Get started
npm i -g @stan-chen/simple-cli
export OPENAI_API_KEY="..."

# Use it
simple "Fix the broken imports in src/"
```

[NPM](https://www.npmjs.com/package/@stan-chen/simple-cli) | [Docs](docs/index.md)

---

## What is this?
Simple-CLI is a high-speed agent that lives in your terminal. It doesn't need an IDE extension or a heavy Electron app. It focuses on one thing: **executing tasks autonomously.**

### 1. Interactive Chat
Just run `simple`. It opens a prompt where you can chat with your codebase, ask questions, and request multi-step features.

### 2. Fast One-Shots
`simple "instruction"` runs a task and exits. Use it for quick refactors or boilerplate generation.

### 3. JIT Agents (`--claw`)
Run `simple --claw "intent"`. This triggers "Just-in-Time" persona generation. The system builds a specialized sub-agent specifically designed for that task, with its own memory and strategy.

---

## Key Capabilities

*   **⚡ Speed Over Bloat**: Zero startup time. Optimized for the terminal.
*   **🧬 Self-Evolution**: The agent can write its own tools in `skills/` or `tools/` and reload them on-the-fly.
*   **🌊 Swarm Mode**: Run `simple --swarm tasks.json`. It spawns isolated agents across Git worktrees to work on different parts of a codebase simultaneously.
*   **🧠 Ghost Tasks**: Tell it to "Check for vulnerabilities every Monday at 9am". It uses your actual OS scheduler (crontab/Task Scheduler) to run background jobs.
*   **🔌 Multi-Model**: Swap between OpenAI, Anthropic, or Google Gemini instantly.

---

## Installation

**From NPM:**
```bash
npm install -g @stan-chen/simple-cli
```

**From Source:**
```bash
git clone https://github.com/stancsz/simple-cli.git
cd simple-cli && npm install && npm run build
npm link
```

---

## Workflows

**The "Organize My Junk" Workflow:**
```bash
simple --claw "Move all screenshots from Desktop to ~/Pictures/Screenshots and categorize by date"
```

**The "Mass Refactor" Workflow:**
```bash
simple --swarm tasks.json --concurrency 3
# tasks.json: [{"instruction": "Add Zod validation to API A"}, {"instruction": "Add Zod to API B"}]
```

**The "Automated Audit" Workflow:**
```bash
simple --claw "Daily security audit of package.json"
```

---

## Project Structure
```text
.
├── src/          # Core reasoning & provider logic
├── tools/        # Technical primitives (read, write, shell)
├── skills/       # Behavioral presets (code, debug, architect)
└── .simple/      # Local agent state, memory, and JIT personas
```

---

## Configurations
Set your keys in `.env` or as environment variables:
*   `OPENAI_API_KEY`
*   `CLAW_MODEL` (Defaults to gpt-4o-mini)
*   `DEBUG=true` (If you want to see the "thought" process)

---

## Credits
Built with [Vercel AI SDK](https://sdk.vercel.ai) and [@clack/prompts](https://github.com/natemoo-re/clack). 

MIT © [Stan Chen](https://github.com/stancsz)
