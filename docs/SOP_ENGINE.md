# SOP Engine: The Digital Co-Worker

The **SOP Engine** allows you to define complex workflows as Markdown files and execute them autonomously using available MCP tools.

## Overview

Traditional automation requires scripting (Python/Bash). The SOP Engine allows you to write instructions in natural language, which an LLM interprets and executes step-by-step.

### Key Features
- **Markdown-Based:** Write SOPs like documentation.
- **Autonomous Execution:** The engine reads steps, checks available tools, and decides how to execute each step.
- **Tool Discovery:** Automatically detects and uses tools from other MCP servers (Git, Filesystem, Brain).
- **Resilience:** Retries failed steps and handles errors gracefully.

## Architecture

The SOP Engine is implemented as an MCP Server (`src/mcp_servers/sop_engine/`).

### Components
1. **Parser (`sop_parser.ts`)**: Converts Markdown into structured steps.
2. **Executor (`executor.ts`)**: The core loop.
   - Initializes an MCP Client to connect to other servers.
   - Iterates through steps.
   - Uses an LLM to determine the best tool for the current step.
   - Maintains execution history and context.
3. **Server (`index.ts`)**: Exposes the engine via MCP tools (`sop_list`, `sop_execute`, `sop_create`).

## Usage

### 1. Listing SOPs
Use the `sop_list` tool to see available workflows in `docs/sops/`.

### 2. Creating an SOP
Write a Markdown file in `docs/sops/` or use `sop_create`.

**Format:**
```markdown
# Title of SOP

Description of the workflow.

1. **Step Name**
   Detailed instructions for the step.
   Mention specific tools if necessary (e.g., "Use git to checkout...").

2. **Next Step**
   ...
```

### 3. Executing an SOP
Use the `sop_execute` tool.

**Arguments:**
- `name`: The filename or title of the SOP (e.g., `market_research`).
- `input`: Context or specific instructions for this run (e.g., "Research AI trends in 2024").

## Example Workflow

**SOP: `market_research.md`**
1. **Search:** Google for the topic.
2. **Summarize:** Read top 3 results and summarize.
3. **Save:** Write summary to `report.md`.

**Execution:**
The Agent calls `sop_execute(name="market_research", input="AI Agents")`.
1. Engine starts.
2. Step 1: Engine sees `google_search` tool. Calls it with "AI Agents".
3. Step 2: Engine gets search results. Summarizes them using LLM.
4. Step 3: Engine sees `write_file` tool. Writes report.
5. Engine completes and returns summary.

## Configuration

The SOP Engine is registered in `mcp.json` (or `mcp.docker.json`):
```json
"sop_engine": {
  "command": "node",
  "args": ["/app/dist/mcp_servers/sop_engine/index.js"]
}
```
