# Simple-CLI Roadmap & TODOs

## Strategic Pivot: "Ingest & Digest" Architecture

This document tracks the migration from ad-hoc internal tools to a strict **MCP-First** architecture.

### 1. Ingest Phase (Standardize External Tools)
- [ ] **Filesystem**: Replace `simple_tools/read_file` with `@modelcontextprotocol/server-filesystem`.
- [ ] **Git**: Replace `simple_tools` git commands with `@modelcontextprotocol/server-git`.
- [ ] **Agents as MCP Servers**:
    - [ ] Create `crewai-mcp`: Wrap `src/agents/deepseek_crewai.ts` into a standalone server.
    - [ ] Create `aider-mcp`: Wrap `src/agents/deepseek_aider.ts` into a standalone server.
    - [ ] Create `claude-mcp`: Wrap `src/agents/deepseek_claude.ts` into a standalone server.
    - [ ] Refine `devin-mcp`: Complete `src/mcp_servers/devin`.

### 2. Digest Phase (Simplify Core Engine)
- [ ] **Remove Logic Duplication**:
    - [ ] Delete `delegate_cli` from `src/builtins.ts`. The engine should just call `run_crew_task` or `aider_edit`.
    - [ ] Remove manual tool loading in `engine.ts`. Use standard MCP discovery.
- [ ] **Context Management**:
    - [ ] Implement a **Context MCP Server** (singleton) to handle `context.json` updates securely (fix race conditions).
    - [ ] Update `engine.ts` to push/pull context via this server.

### 3. Cleanup & Polishing
- [ ] **Security**: Re-enable path validation in the Filesystem MCP server (sandboxing).
- [ ] **Configuration**: Move all agent configurations from `src/config.ts` to `mcp.json`.
- [ ] **Deprecation**: Delete `src/mcp_servers/simple_tools`, `src/agents/*.ts` (once migrated).

### 4. Tests
- [ ] Update tests to mock MCP servers instead of local file paths.
