# Simple-CLI Roadmap & TODOs

## Strategic Pivot: "Ingest & Digest" Architecture

This document tracks the migration from ad-hoc internal tools to a strict **MCP-First** architecture.

### 1. Ingest Phase (Standardize External Tools)
- [ ] **Filesystem**: Replace `simple_tools/read_file` with `@modelcontextprotocol/server-filesystem`.
- [ ] **Git**: Replace `simple_tools` git commands with `@modelcontextprotocol/server-git`.
- [ ] **Agents as MCP Servers**:
    - [x] Create `crewai-mcp`: Wrapped `src/agents/deepseek_crewai.ts` into a standalone server in `src/mcp_servers/crewai`.
    - [ ] Create `aider-mcp`: Wrap `src/agents/deepseek_aider.ts` into a standalone server.
    - [ ] Create `claude-mcp`: Wrap `src/agents/deepseek_claude.ts` into a standalone server.
    - [x] Refine `devin-mcp`: Completed `src/mcp_servers/devin` with session management tools.

### 2. Digest Phase (Simplify Core Engine)
- [ ] **Remove Logic Duplication**:
    - [ ] Delete `delegate_cli` from `src/builtins.ts`. The engine should just call `run_crew_task` or `aider_edit`.
    - [ ] Remove manual tool loading in `engine.ts`. Use standard MCP discovery.
- [ ] **Context Management**:
    - [x] Implement Concurrency Control: Added file locking to `ContextManager` to prevent race conditions.
    - [x] Implement a **Context MCP Server** (singleton) to handle `context.json` updates securely (fix race conditions).
    - [x] Update `engine.ts` to push/pull context via this server.

### 3. Cleanup & Polishing
- [x] **Security**: Re-enabled path validation in `src/builtins.ts` (sandboxing to CWD).
- [ ] **Configuration**: Move all agent configurations from `src/config.ts` to `mcp.json`.
- [ ] **Deprecation**: Delete `src/mcp_servers/simple_tools`, `src/agents/*.ts` (once migrated).
    - [x] Marked `src/agents/*.ts` as deprecated with console warnings.

### 4. Tests
- [ ] Update tests to mock MCP servers instead of local file paths.

### 5. Phase 5: The Digital Co-worker (Deployment & Persona)
- [ ] **Persona Engine**:
    - [ ] Create `src/persona.ts`: Load `persona.json` and wrap LLM responses.
    - [ ] Implement `inject_personality()` function in `src/llm.ts`.
- [ ] **Interfaces**:
    - [ ] Create `src/interfaces/slack.ts`: Implement Slack Bolt.js adapter.
    - [ ] Create `src/interfaces/teams.ts`: Implement Microsoft Bot Framework adapter.
- [ ] **Infrastructure**:
    - [ ] Create `Dockerfile` for lightweight production image.
    - [ ] Create `docker-compose.yml` for local "Agency" simulation (Redis + Agent).
### 6. Phase 6: Enterprise Cognition (The Brain)
- [ ] **Episodic Memory (Vector DB)**:
    - [ ] Evaluate `lancedb` vs `chromadb` (node-compatible).
    - [ ] Create `src/brain/episodic.ts`: Implement embedding generation + storage.
- [ ] **Semantic Memory (Graph)**:
    - [ ] Create `src/brain/semantic.ts`: JSON-based graph store.
    - [ ] Implement entity extraction prompt in `src/llm/prompts.ts`.
- [ ] **Integration**:
    - [ ] Update `ContextManager` to query "The Brain" on initialization.
    - [ ] Create `src/mcp_servers/brain`: Expose memory via MCP for sub-agents.
