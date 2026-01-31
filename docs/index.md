---
layout: home
title: Simple-CLI - Lean Agentic Coding Assistant
---

<p align="center">
  <img src="assets/logo.jpeg" width="240" alt="Simple CLI Logo" />
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

## Key Features

*   **Token Efficiency**: Surgical context management using high-fidelity repo maps.
*   **Universal Tool Support**: Native support for TypeScript tools, multi-language scripts (Python, Bash), and binaries.
*   **Agent Swarms**: Built-in orchestration for parallel, horizontally scalable agent units.
*   **Self-Evolution**: The ability for the agent to create, document, and load its own specialized skills.

---

## Documentation Sections

Explore the following sections to understand the depths of the system:

*   [**Architecture**](architecture.md): A deep dive into provider routing, the registry, and swarm logic.
*   [**Project Structure**](project-structure.md): Recommended directory layout for brand-new repositories.
*   [**The Taxonomy of Action**](taxonomy.md): Understanding the hierarchy of Tools, Scripts, and Skills.
*   [**The Success Loop**](success-loop.md): How Simple-CLI handles the iterative "no-quit" process.
*   [**Design Philosophy**](design-philosophy.md): The niche engineering decisions that drive the project.
*   [**Custom Skills**](custom-skills.md): How to enable the agent to extend its own action space.

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

## 🤝 Contributing & License

Simple CLI is intentionally minimal. Before opening a PR, ask yourself:
1. Does it help headless automation?
2. Can it be a tool instead of core logic?
3. **Does it keep the core under 150 lines?**

Licensed under **MIT**. Built for the swarm era. 🚀
