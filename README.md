# Simple-CLI

> The headless swarm unit.

**Simple-CLI** is a clean, minimalist implementation of a coding agent designed for **scaling agentic swarms**.

It is the **"anti-Cursor"**: it explicitly **does not care** about UI/UX, because a good swarm unit shouldn't. It cares about being a low-cost, reliable, programmable building block that you can spin up by the hundreds to solve problems at scale.

```bash
simple-cli --yolo --auto-commit "refactor auth module to use JWT"
```

---

## Comparison

Different tools for different needs. Here's an honest comparison:

| Feature | Simple-CLI | Aider | Claude Code | Cursor | Cline |
|---------|------------|-------|-------------|--------|-------|
| **Maturity** | ⚠️ Experimental | ✅ Mature | ✅ Mature | ✅ Mature | 📈 Growing |
| **Edit quality** | ⚠️ Basic (Fuzzy) | 🌟 Excellent | 🌟 Excellent | 🌟 Excellent | ✅ Good |
| **Headless/scripting** | 🌟 Native | ✅ Yes | ❌ No | ❌ No | ❌ Needs VS Code |
| **Interactive UX** | ⚠️ Minimal | ✅ Good | 🌟 Excellent | 🌟 Excellent | ✅ Good |
| **Model support** | ✅ Any (LiteLLM) | ✅ Many | ⚠️ Claude only | ✅ Multiple | ✅ Many |
| **MCP Protocol** | ✅ Native | ❌ Planned? | ✅ Native | ⚠️ Limited | ✅ Native |
| **Codebase size** | ~2k LOC | ~50k+ LOC | Proprietary | Proprietary | ~15k LOC |
| **Language** | TypeScript | Python | ? | ? | TypeScript |
| **Documentation** | ⚠️ Sparse | 🌟 Excellent | ✅ Good | ✅ Good | ✅ Good |
| **Community** | ⚠️ Tiny | 🌟 Large | 📈 Growing | 🌟 Large | 📈 Growing |
| **Reliability** | ⚠️ Alpha | 🌟 Production | 🌟 Production | 🌟 Production | ✅ Beta |

**Honest verdict:** If you want a tool that just works out of the box with zero fuss, use **Cursor** or **Aider**. Use **Simple-CLI** only if you are a developer who wants to build *on top of* an agent, integrating it into scripts, pipelines, or your own tools, and you value a codebase you can fully understand and modify.

---

## Use Cases

### 1. Fire and Forget
```bash
# Single command, walk away
simple-cli --yolo --auto-commit --auto-test \
  "add comprehensive test coverage for src/utils/"
```

### 2. Agent Swarms
```python
# Python orchestrator spawning multiple Simple-CLI agents
import subprocess
import asyncio

async def run_agent(task: str, workdir: str):
    proc = await asyncio.create_subprocess_exec(
        'simple-cli', '--yolo', '--moe', task,
        cwd=workdir,
        stdout=asyncio.subprocess.PIPE
    )
    return await proc.communicate()

# Parallel agents working on different modules
await asyncio.gather(
    run_agent("refactor auth module", "./services/auth"),
    run_agent("add input validation", "./services/api"),
    run_agent("optimize database queries", "./services/data"),
)
```

### 3. CI/CD Integration
```yaml
# GitHub Actions
- name: AI Code Review
  run: |
    simple-cli --skill review --yolo \
      "review changes in this PR and suggest improvements"
```

### 4. Cron Jobs
```bash
# Daily dependency updates
0 3 * * * cd /app && simple-cli --yolo --auto-commit \
  "update outdated dependencies and fix any breaking changes"
```

---

## Architecture: Simplicity by Design

```
┌─────────────────────────────────────────────────────────┐
│                    Simple-CLI                           │
├─────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │ LiteLLM │  │ simple- │  │ ts-morph│  │  Clack  │   │
│  │ (models)│  │   git   │  │ (edits) │  │  (UI)   │   │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘   │
│       │            │            │            │         │
│  ┌────┴────────────┴────────────┴────────────┴────┐   │
│  │              Agent Core (~150 LOC)              │   │
│  │  • Parse response → Execute tool → Reflect     │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                               │
│  ┌─────────────────────┴───────────────────────────┐   │
│  │                Tool Registry                     │   │
│  │  readFiles │ writeFiles │ runCommand │ git │ ...│   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                               │
│  ┌─────────────────────┴───────────────────────────┐   │
│  │              MCP Protocol Layer                  │   │
│  │     Composio │ Filesystem │ GitHub │ Memory     │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Core Principles

1. **Minimal core** - The orchestrator is under 150 lines. Everything else is a plugin.
2. **Git-native state** - No database. Git is the source of truth.
3. **Model agnostic** - LiteLLM means any model works: GPT-5.2, Gemini 3 Pro, Claude 3.7, Llama 4.
4. **Tool-first** - 12 built-in tools + unlimited MCP tools.
5. **Fail-forward** - Reflection loop retries with context on failures.

---

## Comparison Deep Dive

### vs Aider

Aider is the most mature open-source AI coding assistant. It's battle-tested and feature-rich.

| Aspect | Aider | Simple-CLI |
|--------|-------|------------|
| **Maturity** | 2+ years, production-ready | New, experimental |
| **Edit quality** | Excellent (10+ formats, tree-sitter) | Good (fuzzy SEARCH/REPLACE) |
| **Repo understanding** | Advanced (repo map, tags) | Basic |
| **Voice input** | ✅ Yes | ❌ No |
| **Browser scraping** | ✅ Full (Playwright) | Basic (fetch only) |
| **Documentation** | Extensive | Minimal |
| **Headless scripting** | ✅ Works well | ✅ Primary focus |
| **MCP tools** | ❌ No | ✅ Yes |

**Use Aider if:** You want a mature, feature-complete tool with excellent edit quality.

**Use Simple-CLI if:** You want a minimal codebase you can understand, modify, or embed.

### vs Claude Code (Anthropic)

| Aspect | Claude Code | Simple-CLI |
|--------|-------------|------------|
| **UX polish** | Excellent | Basic |
| **Edit quality** | Excellent | Good |
| **Model choice** | Claude only | Any model |
| **Headless** | ❌ No | ✅ Yes |
| **Source available** | ❌ No | ✅ Yes |
| **MCP** | ✅ Native | ✅ Yes |

**Use Claude Code if:** You want the best Claude experience with polished UI.

**Use Simple-CLI if:** You need headless operation or model flexibility.

### vs Cursor

| Aspect | Cursor | Simple-CLI |
|--------|--------|------------|
| **Type** | Full IDE | CLI tool |
| **UX** | Excellent | Minimal |
| **Features** | Comprehensive | Focused |
| **Price** | $20/month | Free + model costs |
| **Headless** | ❌ No | ✅ Yes |

**Use Cursor if:** You want AI deeply integrated into a modern IDE.

**Use Simple-CLI if:** You need CLI-based automation without an IDE.

### vs Cline

| Aspect | Cline | Simple-CLI |
|--------|-------|------------|
| **Environment** | VS Code extension | Standalone |
| **Features** | Rich | Minimal |
| **MCP support** | ✅ Good | ✅ Good |
| **Headless** | ⚠️ Needs VS Code | ✅ Native |
| **Community** | Active | New |

**Use Cline if:** You work in VS Code and want powerful AI assistance there.

**Use Simple-CLI if:** You need a standalone CLI you can script or embed.

---

## Quick Start

### Installation
```bash
npm install -g simple-cli
# or
npx simple-cli
```

### Configuration
```bash
# Set your preferred model
export OPENAI_API_KEY="sk-..."
# or
export ANTHROPIC_API_KEY="sk-..."
# or
export GEMINI_API_KEY="..."
```

### Basic Usage
```bash
# Interactive mode
simple-cli

# Single task (fire and forget)
simple-cli --yolo "fix all TypeScript errors in src/"

# With auto-commit
simple-cli --yolo --auto-commit "add input validation to all API endpoints"

# With specific skill
simple-cli --skill architect "design a caching layer for the API"

# With Mix of Experts (cost optimization)
simple-cli --moe --yolo "implement user authentication"
```

### Programmatic Usage
```typescript
import { spawn } from 'child_process';

const agent = spawn('simple-cli', [
  '--yolo',
  '--auto-commit',
  'refactor the database module'
], {
  cwd: '/path/to/project',
  env: { ...process.env, OPENAI_API_KEY: 'sk-...' }
});

agent.stdout.on('data', (data) => console.log(data.toString()));
agent.on('close', (code) => console.log(`Agent finished with code ${code}`));
```

---

## Features

### Code Editing
- **Fuzzy matching** - Finds similar code even with minor differences
- **Whitespace flexibility** - Handles indentation mismatches
- **Reflection loop** - Retries up to 3 times with error context

Note: Aider's editing is more sophisticated (tree-sitter AST, multiple formats). Simple-CLI uses a simpler fuzzy SEARCH/REPLACE approach.

### Mix of Experts (MoE) Routing
Route tasks to the right model tier for cost optimization:


Tier 1: Orchestrator (GPT-5.2 Pro / Gemini 3 Pro) - Complex architecture
Tier 2: Senior (GPT-5.2 Codex / Gemini 3 Deep Think) - Agentic software engineering
Tier 3: Junior (GPT-5 Mini / Gemini 3 Flash) - High-speed reasoning
Tier 4: Intern (GPT-5 Nano) - Low latency tasks
Tier 5: Utility (Gemini 2.5 Flash) - Formatting, docs
```

### Self-Evolution
The agent can upgrade itself by writing new tools.

1.  **Dynamic Registry**: `src/registry.ts` scans `src/tools/*.ts` at runtime.
2.  **Self-Modification**: The agent can use `writeFiles` to create a new tool (e.g., `src/tools/sql.ts`).
3.  **Instant Upgrade**: On the next run, the new tool is automatically loaded and available in the system prompt.

This allows the agent to permanently expand its capabilities (adding database access, API clients, etc.) without you needing to rebuild the core.

### MCP Protocol Support
Connect to 250+ tools via Model Context Protocol:

```json
{
  "mcpServers": {
    "composio": {
      "command": "npx",
      "args": ["-y", "composio-core", "mcp"]
    },
    "github": {
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

### Skills/Presets
Switch agent behavior with `@skill` or `--skill`:

| Skill | Description |
|-------|-------------|
| `@code` | General coding (default) |
| `@architect` | System design, high-level planning |
| `@test` | Writing and debugging tests |
| `@debug` | Troubleshooting issues |
| `@refactor` | Code improvements |
| `@review` | Code review |
| `@git` | Version control operations |
| `@shell` | Shell scripting |
| `@ask` | Read-only Q&A |

---

## CLI Reference

```
USAGE
  $ simple-cli [MESSAGE] [FLAGS]

FLAGS
  --yolo           Auto-approve all tool executions
  --moe            Enable Mix of Experts routing
  --auto-commit    Commit changes automatically
  --auto-lint      Lint after changes (default: true)
  --auto-test      Run tests after changes
  --test-cmd=CMD   Test command to run
  --skill=SKILL    Initial skill (code, architect, test, etc.)
  --watch          Watch files for AI comments

COMMANDS
  simple-cli add <files>     Add files to context
  simple-cli git status      Show git status
  simple-cli git commit      Commit with AI message
  simple-cli mcp status      Show MCP server status

SLASH COMMANDS (in chat)
  /add <file>    Add file to context
  /drop [file]   Remove file(s) from context
  /ls            List files in context
  /diff          Show git diff
  /commit [msg]  Commit changes
  /undo          Undo last commit
  /clear         Clear chat history
  /tokens        Show token usage
  /help          Show commands
```

---

## For Agent Builders

Simple-CLI is designed to be a building block for larger systems.

### Spawn Pattern
```typescript
// Spawn agents for parallel work
const agents = tasks.map(task => 
  spawn('simple-cli', ['--yolo', task], { cwd: workdir })
);
await Promise.all(agents.map(a => new Promise(r => a.on('close', r))));
```

### Supervisor Pattern
```typescript
// Supervisor agent coordinating worker agents
const supervisor = new SimpleCLI({ skill: 'architect' });
const plan = await supervisor.run('break down this feature into tasks');

for (const task of plan.tasks) {
  const worker = new SimpleCLI({ skill: 'code', yolo: true });
  await worker.run(task);
}
```

### Pipeline Pattern
```bash
# Sequential pipeline
simple-cli --yolo "implement feature" && \
simple-cli --skill test --yolo "add tests" && \
simple-cli --skill review --yolo "review and improve" && \
simple-cli --auto-commit "final cleanup"
```

---

## Philosophy: The Swarm Unit

**Simple-CLI** is a response to the heavy, UI-focused tools of today (like Cursor's Composer).

Modern coding agents are powerful but often trapped inside heavy IDEs. If you want to run an **agent swarm**—spinning up 50 agents to refactor a legacy codebase overnight—you don't need 50 instances of VS Code. You need 50 lightweight, headless CLIs.

1.  **Zero UI/UX**: By design. UI is overhead for a swarm.
2.  **Cost Efficiency**: Native **Mix of Experts (MoE)** routing ensures you don't burn **GPT-5.2 Pro** tokens on formatting tasks, keeping the overall system cost low.
3.  **Scalability**: Stateless and git-native means you can parallelize it trivially.

It is designed to be the standardized **"compute unit"** of agentic coding.

**Crucially, Simple-CLI is the WORKER, not the orchestrator.**
It is not designed to manage the entire project roadmap or coordinate other agents. It is designed to take a specific task, execute it reliably, and exit. You build the orchestrator (the "Manager"); Simple-CLI provides the muscles (the "Workers").

**Strengths:**
- Small codebase (~2k LOC) you can read in an afternoon
- Easy to understand, modify, and embed
- Headless-first design for scripting
- Model agnostic via LiteLLM

**Weaknesses:**
- Less mature than alternatives
- Fewer edit formats than Aider
- Basic interactive UX
- Limited documentation
- Not battle-tested in production

**Use Simple-CLI when:**
- You need a minimal, hackable foundation
- You're building agent pipelines or automation
- You want to understand how AI coding agents work
- You need headless/scripted operation

**Use something else when:**
- You need production-ready reliability (use Aider)
- You want polished UX (use Cursor or Claude Code)
- You work primarily in VS Code (use Cline)

---

## License

MIT

---

## Contributing

Simple-CLI is intentionally minimal. Before adding features, ask:

1. Does this help headless/automated usage?
2. Can this be an MCP tool instead of core?
3. Does this keep the core under 150 lines?

If yes to all three, open a PR.
