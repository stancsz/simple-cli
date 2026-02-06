<p align="center">
  <img src="docs/assets/logo.jpeg" alt="Simple-CLI Logo" width="160"/>
</p>

# simple-cli ⚡

**The Terminal-Native AI Partner. Lean. Local. Limitless.**

Stop pasting code into a browser. Start commanding a swarm directly from your terminal.

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

Most AI tools are bloated extensions or heavy desktop apps. **Simple-CLI** is different. It lives where you live: in the shell. It is built for speed, autonomy, and raw power.

It doesn't just "chat." It **executes**.

---

## The Innovations 🚀

### 1. Just-in-Time (JIT) Intelligence 🧠
`simple --claw "Analyze this database schema"`
Don't settle for a generic assistant. When you use `--claw`, the system analyzes your intent and **spawns a specialized sub-agent** specifically architected for that task. It builds its own memory, strategy, and persona on the fly.

### 2. Agent Swarms 🐝
`simple --swarm tasks.json`
Need to migrate 50 files? Don't do it one by one. Unleash a **parallel swarm of agents** to attack the problem simultaneously across your codebase.

### 3. Polyglot Context 🌍
Simple-CLI now understands more than just TypeScript. It automatically scans and builds a symbol map for:
*   TypeScript/JavaScript
*   Python
*   Go
*   Rust

### 4. Self-Evolution: Antifragile Intelligence 🧬
The agent isn't static. It **writes its own tools**. If it needs to query a specific API or parse a weird log format, it codes the tool in Python or Node, saves it to `skills/`, and uses it immediately. It gets smarter and more capable with every command you run.

### 5. Ghost Tasks: Autonomous Missions 👻
"Check for security patches every morning at 8 AM."
Simple-CLI integrates with your OS (crontab/Task Scheduler) to run **autonomous background missions** while you sleep.

### 6. Dynamic Model Routing 🔀
`simple "Refactor the login system"`
The system now intelligently acts as a **Dynamic Model Router**. It analyzes your intent and automatically selects the best LLM for the job:

*   **Scripting & Code Gen** -> Uses **Simple-CLI** with **OpenAI Codex** (GPT-3.5/4) for speed and precision.
*   **Creative & Explanations** -> Uses **Simple-CLI** with **Google Gemini** for fast, fluent responses.
*   **Complex Reasoning** -> Uses **Simple-CLI** with **Claude 3 Opus** for deep architectural analysis.

No more manual flag switching. Just state your intent.

---

## 🔬 Real-World Case Studies

**Case Study 1: Architectural Analysis**
> User: "Explain how to refactor the entire authentication module to use OAuth2."
> **Router Decision:** `model: anthropic:claude-3-opus`
> **Result:** The agent recognized the complexity and architectural nature of the request, automatically selecting Claude's large context window for superior reasoning.

**Case Study 2: Rapid Scripting**
> User: "Write a python script to parse this CSV and plot a graph."
> **Router Decision:** `model: openai:gpt-3.5-turbo-instruct`
> **Result:** The agent chose the lightweight Codex models to instantly generate and verify the script without overhead.

---

## Get Hooked: 3 Commands to Try

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

**Prerequisites:**
*   Python 3 installed
*   `any-llm-sdk` installed (`pip install any-llm-sdk`)

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
