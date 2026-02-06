---
layout: default
title: Home
nav_order: 1
---

# Welcome to the Post-Chat Era ⚡

**Simple-CLI** shifts the paradigm from "chatting with an AI" to "managing AI workers."
It is an **autonomous swarm unit** designed to live, breathe, and execute in your shell.

It replaces the friction of "Context Switch -> Browser -> Chat -> Copy -> Paste" with a single, powerful loop: **Command -> Execution.**

---

## The Philosophy: Less Talk, More Code

We built this for developers who are tired of copy-pasting code blocks from a browser window.
1.  **Terminals are Superior**: The command line is the fastest way to communicate with a computer.
2.  **Agents should be Agile**: An agent shouldn't take 30 seconds to boot up. It should be instant.
3.  **Code is Context**: You shouldn't have to explain your file structure. The agent should see it, understand it, and manipulate it.

---

## The Innovations 🛠️

### 🧠 JIT Intelligence (Just-In-Time)
Most agents are generic "Assistants". Simple-CLI is adaptive. When you run `simple --claw`, the system:
1.  **Analyzes your intent** ("Fix the broken build").
2.  **Generates a persona** ("Senior CI/CD Reliability Engineer").
3.  **Builds a specialized toolset** for that exact moment.
4.  **Executes and vanishes.**

### 🐝 Swarm Architecture
Why have one agent when you can have a workforce? Simple-CLI supports **Swarm Mode**, allowing you to spin up multiple isolated agent instances to tackle massive refactors, migrations, or audit tasks in parallel.

### 🧬 Self-Healing & Evolution
Simple-CLI is **Antifragile**. It can write its own tools. If it encounters a problem it can't solve (e.g., "I need to decode this protobuf"), it writes a Python script or a Node utility, saves it to `skills/`, and uses it immediately.

---

## Start Your Engine

**1. Install**
```bash
npm install -g @stan-chen/simple-cli
```

**2. Configure**
```bash
export OPENAI_API_KEY="sk-..."
```

**3. Launch**
```bash
simple "Audit my package.json for unused dependencies"
```

---

## Explore the Documentation

*   [**The Manifesto**](design-philosophy.md): Understand the "Thin Core" and "Headless-First" philosophy.
*   [**Architecture**](architecture.md): How the brain, hands, and instincts work together.
*   [**Swarm Logic**](taxonomy.md): Understanding the hierarchy of Tools, Scripts, and Skills.
*   [**Custom Skills**](custom-skills.md): Teach your agent new tricks.
*   [**Deployment**](deployment.md): Run Simple-CLI in GitHub Actions or Docker.
*   [**Integrations**](integrations.md): Connect Simple-CLI to Slack, Discord, and Teams.

---

## Join the Movement

Simple-CLI is open source and community-driven. We are building the last CLI tool you will ever need.

[GitHub Repository](https://github.com/stancsz/simple-cli)
