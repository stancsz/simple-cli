---
layout: page
title: Framework Integration Showcase
permalink: /frameworks
---

# 🚀 Framework Integration Showcase

Simple CLI is built on the philosophy of **Ingest-Digest-Deploy**. We can ingest any AI framework and turn it into a subordinate agent in days, not months.

Here is a showcase of our integrations.

## [Jules](https://github.com/stan-chen/simple-cli/tree/main/src/mcp_servers/jules)
*   **Role**: GitHub PR Automation & Code Review.
*   **Time to Integrate**: 2 Days.
*   **MCP Server**: `src/mcp_servers/jules/`
*   **Capabilities**:
    -   Scans PRs for quality issues.
    -   Suggests inline code improvements.
    -   Integrates with GitHub Actions for automated workflows.

## [Aider](https://github.com/stan-chen/simple-cli/tree/main/src/mcp_servers/aider)
*   **Role**: Rapid Coding & Refactoring.
*   **Time to Integrate**: 1 Day.
*   **MCP Server**: `src/mcp_servers/aider/`
*   **Capabilities**:
    -   Context-aware file editing.
    -   Refactoring existing codebases.
    -   Applying unified diffs with high precision.

## [CrewAI](https://github.com/stan-chen/simple-cli/tree/main/src/mcp_servers/crewai)
*   **Role**: Research Swarms & Multi-Agent Planning.
*   **Time to Integrate**: 3 Days.
*   **MCP Server**: `src/mcp_servers/crewai/`
*   **Capabilities**:
    -   Spawns hierarchical agent teams.
    -   Delegates tasks based on role descriptions.
    -   Conducts deep research and synthesis.

## [Devin](https://github.com/stan-chen/simple-cli/tree/main/src/mcp_servers/devin)
*   **Role**: Full-Stack Software Engineer.
*   **Time to Integrate**: 2 Days.
*   **MCP Server**: `src/mcp_servers/devin/`
*   **Capabilities**:
    -   End-to-end feature implementation.
    -   Debugging complex issues across the stack.
    -   Writing and running tests autonomously.

## [Kimi / Moonshot](https://github.com/stan-chen/simple-cli/tree/main/src/mcp_servers/kimi)
*   **Role**: Deep Reasoning & Analysis.
*   **Time to Integrate**: 1 Day.
*   **MCP Server**: `src/mcp_servers/kimi/`
*   **Capabilities**:
    -   Long-context document analysis.
    -   Providing strategic insights.
    -   Solving complex logic puzzles.

---

## 🛠️ How It Works: The Ingest-Digest-Deploy Cycle

1.  **Ingest**: We analyze the framework's API, CLI, or SDK to understand its capabilities.
2.  **Digest**: We wrap the framework in a standard Model Context Protocol (MCP) server. This creates a uniform interface for tool calling and state management.
3.  **Deploy**: The new MCP server is registered in `mcp.json`, making it instantly discoverable by the Simple CLI orchestrator.

[Contribute a New Integration](https://github.com/stan-chen/simple-cli/blob/main/docs/CONTRIBUTING.md)
