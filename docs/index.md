---
layout: home
title: Simple-CLI - Lean Agentic Coding Assistant
---

<p align="center">
  <img src="assets/logo.jpeg" width="240" alt="Simple CLI Logo" />
</p>

> **小西LI巨能打** — Lean, lightweight, and packs a punch.

**Simple-CLI** is a minimalist alternative to heavy-duty AI coding agents. While other tools wrap logic in complex UIs and proprietary IDEs, Simple-CLI operates directly in the terminal, staying close to the metal.

It is designed for developers who need the power of an agentic swarm unit with a core codebase that is readable, understandable, and easily modified.

---

## Quick Start

Get up and running in seconds. Simple-CLI requires no complex configuration or proprietary sign-ups.

```bash
# 1. Install globally
npm install -g @stan-chen/simple-cli

# 2. Set your API key (any provider supported by LiteLLM)
export OPENAI_API_KEY="sk-..."
# Supports ANTHROPIC_API_KEY, GEMINI_API_KEY, DEEPSEEK_API_KEY, etc.

# 3. Start building
simple "Build a premium React dashboard with glassmorphism"
```

---

## Key Features

*   **Token Efficiency**: Surgical context management using high-fidelity repository maps.
*   **Universal Tool Support**: Native support for TypeScript tools, multi-language scripts (Python, Bash), and binaries.
*   **Agent Swarms**: Built-in orchestration for parallel, horizontally scalable agent units.
*   **Self-Evolution**: The agent can create, document, and load its own specialized skills in real-time.

---

## Documentation Sections

Learn more about the system architecture and design:

*   [**Architecture**](architecture.md): Provider routing, the registry, and swarm logic.
*   [**Project Structure**](project-structure.md): Recommended directory layout for new repositories.
*   [**The Taxonomy of Action**](taxonomy.md): Understanding the hierarchy of Tools, Scripts, and Skills.
*   [**The Success Loop**](success-loop.md): The iterative "no-quit" reflection process.
*   [**Design Philosophy**](design-philosophy.md): Engineering decisions that drive the project.
*   [**Custom Skills**](custom-skills.md): Enabling the agent to extend its own action space.

---

## Comparison

| Feature | Simple-CLI | Aider | Claude Code | Cursor |
|---------|:-----------:|:-----:|:-----------:|:------:|
| **Maturity** | Alpha | Mature | Mature | Mature |
| **UX** | Minimalist | CLI-first | Polished | Full IDE |
| **Logic** | **150 LOC Core** | ~50k LOC | Proprietary | Proprietary |
| **Models** | **Any (LiteLLM)** | Many | Claude Only | Multiple |
| **Headless** | Native | Yes | No | No |
| **MCP Protocol** | Native | No | Native | Limited |

---

## Contributing & License

Simple-CLI is intentionally minimal. Before submitting a pull request, please consider:
1. Does the change support headless automation?
2. Can the functionality be implemented as a tool rather than core logic?
3. Does the core remain under 150 lines?

Licensed under **MIT**. Built for the swarm era.
