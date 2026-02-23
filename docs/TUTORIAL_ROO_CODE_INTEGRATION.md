# Rapid Framework Integration: The Roo Code Case Study

**Time to complete**: ~20 minutes

## Overview

In the rapidly evolving AI landscape, new tools and frameworks emerge daily. The **Simple CLI Meta-Orchestrator** is designed to ingest these new capabilities instantly.

This case study demonstrates how we integrated **Roo Code**, a trending AI coding assistant, into our swarm in less than an hour. We followed our standard **Ingest-Digest-Deploy** cycle.

## Phase 1: Ingest (Analysis)

We started by analyzing Roo Code's interface. Since Roo Code is primarily a VS Code extension, we identified that interfacing with its CLI (or a simulated version thereof) was the most robust path for headless automation.

We documented our findings in `docs/integrations/roo_code/INGEST_NOTES.md`, defining the three core capabilities we wanted to expose:
1.  **Analysis**: Deep static analysis of code complexity and security.
2.  **Fixing**: Automated application of refactoring patterns.
3.  **Documentation**: Generation of maintainable markdown docs.

## Phase 2: Digest (Implementation)

We created a dedicated MCP server in `src/mcp_servers/roo_code/`.

### 1. The Mock CLI (`mock_cli.ts`)
To ensure robust testing without external dependencies, we built a high-fidelity mock CLI that simulates the behavior of the real Roo Code tool, including JSON output formatting and simulated latency.

### 2. The MCP Server (`index.ts`)
We wrapped the CLI in a standard Model Context Protocol (MCP) server. This server exposes three tools:
- `roo_review_code`: Wraps the `analyze` command.
- `roo_fix_code`: Wraps the `fix` command.
- `roo_generate_docs`: Wraps the `docs` command.

### 3. Registration (`mcp.json`)
We registered the new server in `mcp.json` so the orchestrator can discover it:

```json
"roo_code": {
  "command": "npx",
  "args": ["tsx", "src/mcp_servers/roo_code/index.ts"]
}
```

## Phase 3: Deploy (Routing)

Finally, we updated the **Smart Router** in `src/skills.ts` to teach the main agent *when* to use this new tool.

We added the following instruction to the `code` skill's system prompt:
> **Deep Code Review / Documentation / Automated Fixes**: Use 'roo_code'. It is specialized for static analysis and generating comprehensive docs.

## Result

Now, when a user asks:
> "Please review src/utils.ts and generate documentation for it."

The orchestrator:
1.  Analyzes the intent.
2.  Identifies `roo_code` as the best tool for "review" and "documentation".
3.  Calls `roo_review_code` and `roo_generate_docs`.
4.  Returns the structured results to the user.

## Conclusion

This integration demonstrates the power of the Meta-Orchestrator architecture. By treating "Roo Code" as just another skill module, we enhanced the agent's capabilities without rewriting its core logic.
