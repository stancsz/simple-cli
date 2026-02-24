# Rapid AI Framework Integration: The "Roo Code" Tutorial

**Time to complete**: ~15 minutes

## Overview

One of Simple CLI's core competitive advantages is its **Meta-Orchestrator Architecture**. Unlike rigid agents hardcoded to specific tools, Simple CLI treats every AI capability as a pluggable module. This allows you to integrate new, trending AI frameworks (like Roo Code, Sweep, or your own custom tools) in **hours, not months**.

In this tutorial, you will go through the full **Ingest-Digest-Deploy** cycle to integrate a simulated version of "Roo Code", a hypothetical AI coding assistant, into your agent.

## Prerequisites

- Node.js installed (>=22.0.0 recommended)
- Simple CLI repository cloned and dependencies installed (`npm install`)

## The Scenario

"Roo Code" is a powerful new tool that excels at analyzing code and applying fixes. We want our Simple CLI agent to be able to delegate tasks to Roo Code whenever it encounters a complex bug.

We have provided a mock CLI tool that simulates Roo Code's behavior for this tutorial.

### Artifacts

All files used in this tutorial can be found in `demos/framework-integration-walkthrough/`.

## Phase 1: Ingest (Analyze the Tool)

Before writing any code, we must understand the interface of the tool we are integrating.

1.  **Run the Mock CLI**:
    Let's see what "Roo Code" can do. Run the following command from the repository root:

    ```bash
    npx tsx demos/framework-integration-walkthrough/mock-roo-cli.ts --help
    ```

2.  **Analyze the Output**:
    You should see:
    ```
    Usage: roo <analyze|fix> <file>
    ```

    We have two core capabilities to expose:
    *   `analyze <file>`: Returns a bug report.
    *   `fix <file>`: Applies a fix to the file.

    **Goal**: We will create an MCP (Model Context Protocol) server that wraps these two commands as tools: `roo_analyze` and `roo_fix`.

## Phase 2: Digest (Create the MCP Server)

Now we wrap the tool in a standard interface.

1.  **Create the Server File**:
    Create a new file at `src/mcp_servers/roo_code/index.ts`.
    *(For this tutorial, you can use the reference implementation provided in `demos/framework-integration-walkthrough/roo_server.ts`)*.

    Here is the code structure you would write:

    ```typescript
    import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
    import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
    import { z } from "zod";
    import { spawn } from "child_process";
    import { join } from "path";

    // Initialize Server
    const server = new McpServer({
      name: "roo-code-integration",
      version: "1.0.0",
    });

    // Define Tool: Analyze
    server.tool(
      "roo_analyze",
      "Analyze a file using Roo Code's advanced reasoning engine.",
      {
        file_path: z.string().describe("The path to the file to analyze"),
      },
      async ({ file_path }) => {
        // ... logic to spawn 'roo analyze' ...
        return { content: [{ type: "text", text: "Analysis Result..." }] };
      }
    );

    // Define Tool: Fix
    server.tool(
      "roo_fix",
      "Apply automated fixes to a file using Roo Code.",
      {
        file_path: z.string().describe("The path to the file to fix"),
      },
      async ({ file_path }) => {
        // ... logic to spawn 'roo fix' ...
        return { content: [{ type: "text", text: "Fix Applied..." }] };
      }
    );

    // Start Server
    async function main() {
      const transport = new StdioServerTransport();
      await server.connect(transport);
    }
    main();
    ```

    *Tip: See `demos/framework-integration-walkthrough/roo_server.ts` for the complete implementation details.*

## Phase 3: Deploy (Update Configuration)

Finally, we tell the Simple CLI orchestrator about the new capability.

1.  **Update `mcp.json`**:
    Add the following entry to your `mcp.json` file in the root directory:

    ```json
    "roo_code": {
      "command": "npx",
      "args": [
        "tsx",
        "demos/framework-integration-walkthrough/roo_server.ts"
      ]
    }
    ```
    *(Note: In a real integration, you would point to `src/mcp_servers/roo_code/index.ts`)*

2.  **Run the Agent**:
    Now, start your agent:
    ```bash
    npm start
    ```

3.  **Verify**:
    Ask the agent:
    > "Please analyze the file `test.ts` using Roo Code."

    The Orchestrator will:
    1.  See the `roo_analyze` tool in its registry.
    2.  Recognize it matches the user's intent.
    3.  Delegate the task to the `roo_code` MCP server.
    4.  Return the analysis result to you.

## Why This Matters

By following this pattern, you've added a completely new AI capability to your agent in minutes. The "Brain" automatically handles context sharing, and the Orchestrator handles tool selection.

**Key Benefits:**
*   **Token Efficiency**: The specialized tool (Roo Code) handles the heavy lifting, saving context window for the main agent.
*   **Modularity**: You can upgrade or replace Roo Code without breaking the core agent.
*   **Speed**: No need to wait for official framework support. If it has a CLI or API, you can integrate it.

## Challenge

Now that you've mastered the basics, try integrating a real tool!
*   **Idea**: Integrate the `gh` CLI to let your agent manage GitHub Issues.
*   **Idea**: Integrate `docker` CLI to let your agent manage containers.

Submit a PR with your new integration!

## Advanced: Automated Integration (Phase 16)

For rapid prototyping, you can use the **Framework Analyzer MCP Server** to automate the "Ingest" and "Digest" phases.

1.  **Analyze the Tool**:
    Ask the agent: "Analyze the 'gh' CLI tool."
    The `framework_analyzer` will run `gh --help` and extract its capabilities.

2.  **Generate Scaffold**:
    Ask the agent: "Generate an MCP server for 'github' based on the analysis."
    The analyzer will create `src/mcp_servers/github/` with `index.ts`, `tools.ts`, and `config.json`.

3.  **Deploy**:
    You simply need to register the new server in `mcp.json` and restart.
