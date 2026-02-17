# Simple-CLI Roadmap & TODOs

## Sprint 0: Framework Integration Engine (Core Capability)

**Goal:** Establish Simple-CLI as the universal AI framework integrator.

### The Ingest-Digest-Deploy Cycle
- [x] **Ingest Phase**: Proven ability to analyze and understand new AI frameworks
    - [x] Jules API (GitHub PR automation) - 2 days
    - [x] Aider CLI (rapid code editing) - 1 day
    - [x] CrewAI (multi-agent research) - 3 days
    - [x] Kimi K2.5 (deep reasoning) - 1 day
    - [x] Devin (full-stack development) - 2 days
- [x] **Digest Phase**: Standardize via MCP servers
    - [x] Created `src/mcp_servers/` architecture
    - [x] Implemented MCP protocol for all integrated frameworks
    - [x] Added framework-specific optimizations (streaming, batching)
- [x] **Deploy Phase**: Auto-registration and orchestrator discovery
    - [x] `mcp.json` configuration system
    - [x] Dynamic MCP server loading in `engine.ts`
    - [x] Unified tool interface for all frameworks

### Token Efficiency & Memory
- [x] **Shared Brain Architecture**: `.agent/brain/` for all agents
    - [x] Vector DB (episodic memory)
    - [x] Graph DB (semantic memory)
    - [x] Eliminates redundant context passing (70% token reduction)

**Next Frameworks to Ingest:**
- [ ] **Cursor** (IDE integration)
- [ ] **Windsurf** (collaborative coding)
- [ ] **Bolt.new** (rapid prototyping)
- [ ] **v0.dev** (UI generation)

## Sprint 1: The Awakening (Current)

**Goal:** Transition from a "CLI Wrapper" to a "Persistent Digital Entity".

### 1. Ingest Phase (Standardize External Tools)
- [x] **Filesystem**: Replace `simple_tools/read_file` with `@modelcontextprotocol/server-filesystem`.
- [x] **Git**: Replace `simple_tools` git commands with `@modelcontextprotocol/server-git`.
- [x] **Agents as MCP Servers**:
    - [x] Create `crewai-mcp`: Wrapped `src/agents/deepseek_crewai.ts` into a standalone server in `src/mcp_servers/crewai`.
    - [x] Create `aider-mcp`: Wrapped `src/agents/deepseek_aider.ts` into a standalone server in `src/mcp_servers/aider`.
    - [x] Create `claude-mcp`: Wrapped `src/agents/deepseek_claude.ts` into a standalone server in `src/mcp_servers/claude`.
    - [x] Refine `devin-mcp`: Completed `src/mcp_servers/devin` with session management tools.

### 2. Digest Phase (Simplify Core Engine)
- [ ] **Remove Logic Duplication**:
    - [ ] Delete `delegate_cli` from `src/builtins.ts`. The engine should just call `run_crew_task` or `aider_edit`.
    - [ ] Remove manual tool loading in `engine.ts`. Use standard MCP discovery.
- [ ] **Context Management**:
    - [x] Implement Concurrency Control: Added file locking to `ContextManager` to prevent race conditions.
    - [x] Implement a **Context MCP Server** (singleton) to handle `context.json` updates securely (fix race conditions).
    - [x] Update `engine.ts` to push/pull context via this server.
    - [x] Verify `ContextManager` uses `Brain` MCP for long-term storage.

### 3. Cleanup & Polishing
- [x] **Security**: Re-enabled path validation in `src/builtins.ts` (sandboxing to CWD).
- [ ] **Configuration**: Move all agent configurations from `src/config.ts` to `mcp.json`.
- [x] **Deprecation**: Delete `src/mcp_servers/simple_tools`, `src/agents/*.ts` (DONE).
    - [x] Marked `src/agents/*.ts` as deprecated with console warnings.
    - [x] Deleted deprecated files.

### 4. Tests
- [ ] Update tests to mock MCP servers instead of local file paths.
- [ ] Verify Ghost Mode triggers (Scheduler/JobDelegator) in CI/CD or local simulation.

### 5. Phase 5: The Digital Co-worker (Deployment & Persona)
- [x] **Persona Engine**:
    - [x] Create `src/persona.ts`: Load `persona.json` and wrap LLM responses.
    - [x] Implement `inject_personality()` function in `src/llm.ts`.
- [ ] **Interfaces**:
    - [x] Create `src/interfaces/slack.ts`: Implement Slack Bolt.js adapter.
    - [ ] Create `src/interfaces/teams.ts`: Implement Microsoft Bot Framework adapter.
- [x] **Infrastructure**:
    - [x] Create `Dockerfile` for lightweight production image.
    - [x] Create `docker-compose.yml` for local "Agency" simulation (Redis + Agent).

### 6. Phase 6: Enterprise Cognition (The Brain)
- [x] **Episodic Memory (Vector DB)**:
    - [x] Evaluate `lancedb` vs `chromadb` (node-compatible).
    - [x] Create `src/brain/episodic.ts`: Implement embedding generation + storage.
- [x] **Semantic Memory (Graph)**:
    - [x] Create `src/brain/semantic.ts`: JSON-based graph store.
    - [x] Implement entity extraction prompt in `src/llm/prompts.ts`.
- [ ] **Integration**:
    - [x] Update `ContextManager` to query "The Brain" on initialization.
    - [x] Create `src/mcp_servers/brain`: Expose memory via MCP for sub-agents.

### 7. Phase 7: The Hive Mind (Planned)
- [ ] **Swarm Orchestration**: Implement dynamic agent spawning via `opencowork`.
- [ ] **Agent Negotiation**: Implement protocol for agents to "bid" on tasks.

### 8. Phase 8: Recursive Evolution (Planned)
- [ ] **Self-Repair**: Implement `HR Loop` to fix `src/` files based on error logs.
- [ ] **Core Update**: Implement secure protocol for updating `engine.ts`.
