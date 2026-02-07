<p align="center">
  <img src="assets/logo.jpeg" alt="Simple-CLI Logo" width="160"/>
</p>

# Simple-CLI ⚡

**The Terminal-Native AI Partner. Lean. Local. Limitless.**

Simple-CLI is an all-in-one autonomous agent designed to be your synthetic human colleague. It manages sessions, memories, and self-reflection to execute tasks with 99% autonomy.

## Key Features

1.  **AnyLLM Integration**: Seamlessly switch between OpenAI Codex, Google Gemini, Anthropic Claude, and more.
2.  **Autonomous Agent**: Manages its own state, reflects on failures, and adapts its strategy.
3.  **Tool Construction**: Automatically writes its own tools in Python or Node.js and remembers them for future use.
4.  **Internet Capable**: Browses the web to find documentation, download tools, or debug issues when it gets stuck.
5.  **Synthetic Colleague**: "Give me a report on today's stock market everyday" - it understands intent and executes like a human.

## Installation

```bash
npm install -g @stan-chen/simple-cli
export OPENAI_API_KEY="..." # Or ANTHROPIC_API_KEY, GEMINI_API_KEY
```

## Usage

**General Task:**
```bash
simple "Refactor the authentication layer in src/auth"
```

**Autonomous Research:**
```bash
simple "Search the web for the latest SvelteKit breaking changes and summarize them"
```

**Persona Mode:**
Use specialized personas for specific roles (Data Engineer, QA, etc.).
See [examples/](examples/) for available personas.

```bash
export CLAW_WORKSPACE=$(pwd)/examples/data-engineer
simple --claw "Optimize the ETL pipeline"
```

## Project Structure

*   `src/`: Core logic and AnyLLM bridge.
*   `.simple/`: Local agent state (memory, learnings).
*   `examples/`: Pre-defined personas (SOULs).

---
MIT © [Stan Chen](https://github.com/stancsz)
