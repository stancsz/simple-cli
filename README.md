<p align="center">
  <img src="docs/assets/logo.jpeg" alt="Simple-CLI Logo" width="160"/>
</p>

# simple-cli ⚡

**The Autonomous Partner for Your Terminal.**

Stop chatting. Start commanding.
Deploy a swarm of agents on your codebase. No copy-pasting. No waiting. Just pure, autonomous execution.

```bash
# Ignite
npm i -g @stan-chen/simple-cli
export OPENAI_API_KEY="..."

# Deploy
simple "Refactor the authentication layer in src/auth"
```

[NPM](https://www.npmjs.com/package/@stan-chen/simple-cli) | [Documentation](https://stancsz.github.io/simple-cli)

---

## Why Simple-CLI?

Most AI tools are passive chatbots waiting for input. **Simple-CLI** is an **autonomous workforce** that lives in your shell. It is built for speed, massive scale, and self-evolution.

It doesn't just "help." It **executes**.

---

## The Game Changers 🚀

### 1. JIT Agents: Context-Aware Intelligence 🧠
`simple --claw "Analyze this database schema"`
Don't settle for a generic assistant. When you use `--claw`, the system adapts. It analyzes your intent and **spawns a specialized sub-agent** (e.g., "Senior PostgreSQL Architect") with a dedicated memory, strategy, and toolset architected specifically for that task.

### 2. Swarm Mode: Parallel Execution 🐝
`simple --swarm tasks.json`
One agent is a helper. A swarm is a workforce. Need to migrate 50 files? **Unleash the swarm.** Spin up parallel agents to attack the problem simultaneously across your codebase. Watch 10 hours of work finish in 10 minutes.

### 3. Self-Evolution: Adaptive Tooling 🧬
The agent isn't static. It **writes its own tools**. If it needs to query a specific API or parse a unique log format, it codes the tool in Python or Node, saves it to `skills/`, and uses it immediately. It becomes more capable with every command you run.

### 4. Ghost Tasks: Background Automation 👻
"Check for security patches every morning at 8 AM."
Simple-CLI integrates deeply with your OS to run **autonomous background missions**. It audits your code, optimizes your DB, and cleans up your logs while you sleep.

---

## Witness the Power

**The "Architect" Workflow:**
```bash
simple --claw "Read my entire src folder and generate a mermaid diagram of the architecture"
```

**The "Cleanup Crew" Workflow:**
```bash
simple --swarm tasks.json --concurrency 5
# tasks.json contains a list of linting or refactoring jobs.
```

**The "Research Assistant" Workflow:**
```bash
simple "Search the web for the latest SvelteKit breaking changes and summarize them"
```

---

## 🎭 Persona Gallery

Need a specialist? We've included a library of high-performance personas in `examples/`.
From **Data Scientists** to **Marketing Directors**, switch modes instantly:

```bash
# Summon the Data Engineer
export CLAW_WORKSPACE=$(pwd)/examples/data-engineer
simple --claw "Optimize the ETL pipeline"
```

[Explore the full gallery in `examples/README.md`](examples/README.md)

### 🤖 Integrations & Deployment
Deploy Simple-CLI as an automated agent in your workflow:
*   [**GitHub Actions**](examples/ci-cd/github-actions/README.md): Automate PR reviews and audits.
*   [**Slack Bot**](examples/integrations/slack/README.md): Chat with your agent in Slack.
*   [**Discord Bot**](examples/integrations/discord/README.md): Add an AI assistant to your server.
*   [**Microsoft Teams**](examples/integrations/teams/README.md): Enterprise chat integration.

---

## Installation

**From NPM (Recommended):**
```bash
npm install -g @stan-chen/simple-cli
```

**From Source (For the Hackers):**
```bash
git clone https://github.com/stancsz/simple-cli.git
cd simple-cli && npm install && npm run build
npm link
```

---

## Project Structure
```text
.
├── src/          # The Brain (Core reasoning & provider logic)
├── tools/        # The Hands (Technical primitives: read, write, shell)
├── skills/       # The Instincts (Behavioral presets: code, debug, architect)
└── .simple/      # The Soul (Local agent state, memory, and JIT personas)
```

---

## Configuration
Set your keys in `.env` or export them:
*   `OPENAI_API_KEY` (or Anthropic, Google, etc.)
*   `CLAW_MODEL` (Defaults to `gpt-4o-mini` for speed)
*   `DEBUG=true` (Unlock the matrix: see the agent's thought process)

---

## Credits
Forged with [Vercel AI SDK](https://sdk.vercel.ai) and [@clack/prompts](https://github.com/natemoo-re/clack).

MIT © [Stan Chen](https://github.com/stancsz)
