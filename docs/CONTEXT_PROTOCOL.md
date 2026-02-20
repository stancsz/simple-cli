# Unified Context Protocol (UCP)

The Unified Context Protocol ensures that all agents within the Simple CLI ecosystem share a consistent, synchronized memory state. This prevents race conditions when multiple agents (e.g., the CLI, the Ghost Mode Daemon, and sub-agents) attempt to read or modify the shared context simultaneously.

## Architecture

The context is managed by a **singleton MCP Server** (`src/mcp_servers/context_server/`).

*   **Single Source of Truth**: The `.agent/context.json` file is the persistent storage.
*   **Concurrency Control**: The `context_server` process uses `proper-lockfile` to ensure atomic reads and writes.
*   **Access Pattern**: Clients (like the `ContextManager` in the engine) do NOT access the file directly. Instead, they use the MCP protocol to call tools:
    *   `read_context(company?)`
    *   `update_context(updates, company?)`
    *   `clear_context(company?)`

## Implementation Details

### Context Server
Located in `src/mcp_servers/context_server/index.ts`. It runs as a standalone process (managed by `mcp.ts`) and exposes the MCP tools. It handles:
*   File locking (retries, stale lock detection).
*   Schema validation (Zod).
*   Deep merging of updates.
*   Multi-tenant isolation (via `--company` flag).

### Context Manager (Client)
Located in `src/context/ContextManager.ts`. It acts as a thin client wrapper around the MCP tools.
*   It initializes with an `MCP` client instance.
*   Methods like `readContext` and `updateContext` delegate to `client.callTool(...)`.
*   It also handles integration with the **Brain** (episodic memory) for `loadContext` (retrieval) and `saveContext` (storage).

## Usage

To use the context in a new component:

```typescript
import { MCP } from "../mcp.js";

// 1. Get the MCP client
const client = mcp.getClient("context_server");

// 2. Call the tool
const result = await client.callTool({
  name: "read_context",
  arguments: {}
});

const context = JSON.parse(result.content[0].text);
```

## Benefits
1.  **Race Condition Prevention**: File locks ensure no lost updates.
2.  **Decoupling**: The engine doesn't need to know about file paths or locking logic.
3.  **Observability**: All context changes go through a single point, making logging and debugging easier.
