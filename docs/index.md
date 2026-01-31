# Simple-CLI

Simple-CLI is a minimalist alternative to heavy-duty AI coding agents. While other tools wrap logic in complex UIs and proprietary IDEs, Simple-CLI operates directly in the terminal, staying close to the metal.

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
simple "Build a premium React dashboard"
```

---

## Key Features

*   **Token Efficiency**: Surgical context management using high-fidelity repository maps.
*   **Universal Tool Support**: Native support for TypeScript tools, multi-language scripts (Python, Bash), and binaries.
*   **Agent Swarms**: Built-in orchestration for parallel, horizontally scalable agent units.
*   **Self-Evolution**: The agent can create, document, and load its own specialized skills in real-time.

---

## Documentation Sections

*   [**Architecture**](architecture.md): Provider routing, the registry, and swarm logic.
*   [**Project Structure**](project-structure.md): Recommended directory layout for new repositories.
*   [**The Taxonomy of Action**](taxonomy.md): Understanding the hierarchy of Tools, Scripts, and Skills.
*   [**The Success Loop**](success-loop.md): The iterative "no-quit" reflection process.
*   [**Design Philosophy**](design-philosophy.md): Engineering decisions that drive the project.
*   [**Custom Skills**](custom-skills.md): Enabling the agent to extend its own action space.

---

## Contributing & License

Simple-CLI is intentionally minimal. Before submitting a pull request, please consider if the change supports headless automation and keeps the core under 150 lines.

Licensed under **MIT**. Built for the swarm era.
