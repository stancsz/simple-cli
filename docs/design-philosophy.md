# Design Philosophy

Simple-CLI is built on specific engineering niche decisions that prioritize hackability, efficiency, and autonomous reliability.

## 1. The Thin Core Principle
The core of Simple-CLI is intentionally kept minimal (under 200 lines). Most complexity is moved into the **Tool Registry** and **Skills**. This ensures that the agent can repair or expand its own capabilities without requiring a rebuild of the primary application.

## 2. Platform-Agnostic Execution
We standardized tool communication on **JSON over stdin/env**. This removed the friction of cross-language development, allowing the agent to utilize Python, Bash, Node, or compiled binaries with the same ease.

## 3. Git as the Source of Truth
Simple-CLI treats Git as the primary database for state and coordination.
*   **Auto-commits**: The agent can autonomously document and commit its progress.
*   **Safety**: Integrated undo/redo functionality relies on Git snapshots, making experimental changes safe.

## 4. Context Precision over Volume
Rather than filling the context window with the entire repository, Simple-CLI uses **surgical context loading**. It uses just enough "vision" (via repo maps) to identify exactly which files it needs to modify, maximizing the reasoning quality of the LLM.

## 5. Headless-First Operation
While Simple-CLI has a premium TUI, it is optimized for headless execution. Flags like `--yolo` and the Swarm coordinator allow it to run in CI/CD pipelines, background loops, or remote servers without human intervention.
