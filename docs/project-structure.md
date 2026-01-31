# Recommended Project Structure

When initializing a new repository or integrating Simple-CLI into an existing one, we highly recommend following this standardized directory structure. This ensures the agent can immediately discover your documentation, scripts, and custom capabilities.

## Standard Directories

| Directory | Purpose | Discovery Logic |
| :--- | :--- | :--- |
| `docs/` | Project specs, PRDs, and guides. | Agent scans this for domain context. |
| `scripts/` | Project-specific automation scripts. | Scanned by the Tool Registry. |
| `skills/` | High-level expert "Skills" (MD + Script). | Scanned by the Tool Registry. |
| `tools/` | Project-level system tools (TS/JS). | Unioned with built-in core tools. |
| `mcp/` | Project-specific MCP server configs. | Unioned with global MCP settings. |
| `.simple/` or `.agent/` | Orchestration, Rules & Tests. | Root for project success criteria. |

---

## Orchestration & Rules (.simple / .agent)

The `.simple/` or `.agent/` folder serves as the "brain" for project-specific orchestration. It contains documentation that defines the boundaries and success criteria of the agentic loop.

*   **Custom Prompts**: Store specialized project instructions or personas here (e.g., `prompts.md`).
*   **Success Criteria**: Define what "done" looks like for this specific project (e.g., `rules.md`, `REQUIREMENTS.md` or `SPEC.md`).
*   **Tests**: Store validation logic or test scripts used by the **Success Loop** to verify task completion.
*   **Autonomous Evolution**: If these folders or their core files are missing, Simple-CLI may autonomously create them based on the initial user prompt and project analysis to establish a baseline for its work.

---

## The /tools Folder (Project-Level Primitives)

The `tools/` folder in your project root is for native TypeScript or JavaScript tools that you want to add to the agent's core capabilities at runtime.

*   **Discovery**: Simple-CLI scans the root `tools/` folder at startup.
*   **Core Union**: Capabilities found here are **unioned** with the agent's built-in tools (like `readFiles` or `runCommand`).
*   **Safety & Types**: Since these are native exports, they provide the same performance and type-safety as built-in tools.
*   **Conflict Resolution**: Your project's tools can override built-in tools if they share the same name, allowing you to customize the agent's behavior for a specific repo.

#### Example Tool (`tools/helloProject.ts`):
```typescript
import { z } from 'zod';

export const tool = {
  name: 'helloProject',
  description: 'A sample tool stored in the project-level tools folder',
  inputSchema: z.object({
    name: z.string()
  }),
  execute: async ({ name }) => {
    return `Hello ${name}! This is a project-level tool.`;
  }
};
```

---

## Core Configuration Files

### 1. `AGENT.md` (The Project Rulebook)
Stored in the project root, this file acts as the primary "instruction manual" for the agent.
- **Usage**: Define coding standards, testing requirements, and task constraints.
- **Visibility**: Every request processed by the agent includes the contents of this file in its system prompt.

### 2. `.env` (Environment & Credentials)
Place a `.env` file in the root directory to store API keys and other sensitive configurations.
- **Auto-loading**: Simple-CLI automatically loads this file at startup.
- **Dynamic Context**: If you switch directories (CWD) within the CLI, the agent will attempt to reload the `.env` from the new path.

### 3. `mcp/` (Project-Specific MCP)

You can include project-specific Model Context Protocol (MCP) server configurations to give the agent specialized repo-level capabilities.

-   **Discovery**: Simple-CLI scans for `mcp.json` in the root OR individual `.json` files within an `mcp/` directory.
-   **Global Union**: Local configurations are **unioned** with your global MCP settings (e.g., from `~/.config/simplecli/mcp.json`). Both are available at runtime.
-   **Isolation**: This is ideal for tools that should only exist within a specific project context, like a local database explorer or a project-specific build server.

#### Example MCP Config (`mcp/sqlite.json`):
```json
{
  "mcpServers": {
    "local-db": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite", "--db", "./data/local.db"]
    }
  }
}
```

---

## Why use this structure?
While Simple-CLI is flexible enough to work with files in the root, using this structure provides:
1. **Context Isolation**: Keeps `scripts/` separate from your production code.
2. **Recursive Discovery**: The agent is optimized to recursively scan these specific folders.
3. **Just-in-Time Persona**: The agent "becomes" an expert for that specific project by loading its local tools and rules.
