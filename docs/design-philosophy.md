---
layout: default
title: The Manifesto
nav_order: 6
---

# The Manifesto 📜

Simple-CLI is built on a set of radical engineering decisions. We prioritize **hackability**, **speed**, and **autonomous reliability** above all else.

## 1. The Lean & Mean Core 🏎️
**"Code that is easy to delete is code that is easy to maintain."**
We keep the core application logic under 200 lines. Complexity belongs in the **Tool Registry**, not the engine. This ensures that the agent can repair, upgrade, or completely rewrite its own capabilities without breaking the host system.

## 2. Platform Agnosticism 🌐
**"Language is a barrier. JSON is a bridge."**
We standardized tool communication on **JSON over stdin/env**. This destroys the friction of cross-language development. The agent can seamlessly weave together Python scripts, Bash one-liners, Node.js modules, and Rust binaries into a single workflow.

## 3. Git is the Source of Truth 🛡️
**"If it's not in Git, it didn't happen."**
Simple-CLI treats Git as its database.
*   **Auto-commits**: Every significant action is documented.
*   **Safety**: We rely on Git snapshots for undo/redo. This gives the agent the confidence to experiment, knowing it can always roll back.

## 4. Surgical Precision 🎯
**"Context is expensive. Focus is free."**
Most agents fail because they are overwhelmed by noise. Simple-CLI uses **repo mapping** to load only the "vision" it needs. It identifies exactly which files to modify, maximizing the reasoning quality of the LLM.

## 5. Headless-First 🤖
**"The best UI is no UI."**
While we offer a TUI, our soul is in automation. Flags like `--yolo` and the Swarm coordinator are designed for CI/CD pipelines, cron jobs, and remote servers. We are building the worker bees of the future.

---

## The Future of Coding

We are moving away from "Copilots" that sit in your IDE and wait for you to type. We are moving towards **Agents** that run in the background, fixing bugs, refactoring code, and optimizing performance while you sleep.

**Simple-CLI is the first step.**
