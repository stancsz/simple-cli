---
layout: default
title: Architecture
nav_order: 2
---

# System Architecture

Simple-CLI's power stems from its modular design and "Just-in-Time" context resolution.

## 1. The Tool Registry
The `ToolRegistry` is the engine for capability discovery. It scans multiple project directories (`skills/`, `scripts/`, `tools/`) and standardizes their interfaces:
*   **Standardized Input**: All tools receive arguments via **stdin** (JSON) and the `TOOL_INPUT` environment variable.
*   **Deep Discovery**: It can parse internal docstring headers from script files or couple them with matching `.md` documentation files.

## 2. Multi-Provider Router
To balance cost and intelligence, Simple-CLI employs a routing mechanism:
*   **Mixture of Experts (MoE)**: Features a lightweight router that determines the optimal model tier for the current task.
*   **Unified Interface**: Supports major providers (OpenAI, Anthropic, Google) through the Vercel AI SDK.

## 3. Context Management
Effective agentic coding requires precision, not volume. Simple-CLI manages context through:
*   **High-Fidelity Repo Maps**: Condensed structural summaries that help the LLM navigate the codebase without seeing every line of code.
*   **Token Optimization**: Real-time token counting and pressure management to prevent context overflow and reduce costs.

## 4. Swarm Engine
The Swarm Engine allows coordinate execution across multiple agent instances:
*   **Advisory Locking**: Uses file-based locking to prevent concurrent agents from colliding on the same files.
*   **Git-Native State**: All task states and coordination are handled through filesystem primitives, requiring no external database or infrastructure.