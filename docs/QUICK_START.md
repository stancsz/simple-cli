# Interactive Quick Start: The Integration Wizard

The `simple quick-start` command is the fastest way to understand how Simple CLI integrates with other AI frameworks using the Model Context Protocol (MCP).

## Overview

This interactive wizard allows you to:
1.  **Experience 3 Real-World Scenarios**: See how the agent delegates tasks to specialized frameworks (Aider, CrewAI, v0.dev).
2.  **Inspect the Wiring**: View the raw JSON-RPC messages exchanged between the orchestrator and the tools.
3.  **Get Configured**: Generate a personalized `mcp.json` snippet to enable these integrations in your own projects.

## Usage

Simply run:

```bash
simple quick-start
```

You will be presented with a menu:

```text
? Choose a demo scenario:
> Fix a Bug (Aider)
  Research Topic (CrewAI)
  Generate UI (v0.dev)
  System Tour
```

### The Scenarios

#### 1. Fix a Bug (Aider)
Simulates a coding task where a file has a bug.
-   **Role**: Coding Specialist
-   **Action**: The agent detects a Python syntax error or logical bug and uses Aider to patch it.
-   **Highlight**: Shows how `aider_chat` tool is called with file context.

#### 2. Research Topic (CrewAI)
Simulates a deep-dive research request.
-   **Role**: Research Team
-   **Action**: Spawns a multi-agent crew (Researcher + Writer) to investigate a topic.
-   **Highlight**: Shows the `start_crew` tool execution and the synthesis of multiple agent outputs.

#### 3. Generate UI (v0.dev)
Simulates a frontend design task.
-   **Role**: UI/UX Designer
-   **Action**: Generates a React/Vue component from a text description.
-   **Highlight**: Shows the `v0dev_generate_component` tool returning a preview URL and code.

## "Under the Hood" Mode

During execution, the wizard displays the raw MCP communication:

```json
[MCP Tx] {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"aider_chat","arguments":{"message":"Fix the bug..."}}}
[MCP Rx] {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"..."}]}}
```

This transparency confirms that Simple CLI is not "faking it"—it is acting as a true orchestrator, delegating work to specialized sub-agents via a standardized protocol.

## Demonstration vs. Real Execution

By default, the Quick Start wizard uses a **Simulated MCP Server**. This ensures that the demo works instantly on any machine, even if you don't have:
-   `aider` installed
-   Python/CrewAI environments set up
-   API keys configured

However, the protocol logic is identical. When you are ready for the real thing, simply install the respective tools and add them to your `mcp.json`.

## Generating Configuration

At the end of the wizard, you can choose to generate an `mcp.json` snippet.

```json
{
  "mcpServers": {
    "aider": {
      "command": "npx",
      "args": ["tsx", "src/mcp_servers/aider-server.ts"],
      "env": { "DEEPSEEK_API_KEY": "..." }
    }
  }
}
```

Copy this into your project root to permanently enable these superpowers.
