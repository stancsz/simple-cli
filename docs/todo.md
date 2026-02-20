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
    - [x] Picoclaw (reasoning framework) - 1 day
    - [x] Cursor (IDE integration) - 1 day
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
- [x] **Windsurf** (collaborative coding)
- [x] **Bolt.new** (rapid prototyping)
- [x] **v0.dev** (UI generation)

## Sprint 0.5: Local AI Stack (Dify) (✅ Completed)

**Goal:** Provide a local, privacy-first orchestration layer for rapid prototyping.

- [x] **Setup Dify locally for coding project**: Created `docker-compose.dify.yml`.
- [x] **Configure Supervisor Agent**: Added `dify_agent_templates/supervisor_agent.json`.
- [x] **Configure Coding Agent**: Added `dify_agent_templates/coding_agent.json`.
- [x] **Documentation**: Added `docs/LOCAL_DIFY.md`.
- [x] **Smart Router Integration**: Updated `src/skills.ts` and `sop_engine` to delegate privacy-sensitive tasks to Dify.

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
- [x] **Remove Logic Duplication**:
    - [x] Delete `delegate_cli` from `src/builtins.ts`. The engine should just call `run_crew_task` or `aider_edit`.
    - [x] Remove manual tool loading in `engine.ts`. Use standard MCP discovery.
- [x] **Context Management**:
    - [x] Implement Concurrency Control: Added file locking to `ContextManager` to prevent race conditions.
    - [x] Implement a **Context MCP Server** (singleton) to handle `context.json` updates securely (fix race conditions).
    - [x] Update `engine.ts` to push/pull context via this server.
    - [x] Verify `ContextManager` uses `Brain` MCP for long-term storage.

### 3. Cleanup & Polishing
- [x] **Security**: Re-enabled path validation in `src/builtins.ts` (sandboxing to CWD).
- [x] **Configuration**: Move all agent configurations from `src/config.ts` to `mcp.json`.
- [x] **Deprecation**: Delete `src/mcp_servers/simple_tools`, `src/agents/*.ts` (DONE).
    - [x] Marked `src/agents/*.ts` as deprecated with console warnings.
    - [x] Deleted deprecated files.

### 4. Tests
- [x] Update tests to mock MCP servers instead of local file paths.
- [x] Verify Ghost Mode triggers (Scheduler/JobDelegator) in CI/CD or local simulation.
- [x] **Comprehensive Integration**: Implemented 24h simulation tests for Ghost Mode, Brain, and HR Loop (`tests/integration/ghost_mode_integration.test.ts`).

### 5. Phase 4.5: SOP Engine
- [x] **Core Logic**:
    - [x] Create `sop_parser.ts`.
    - [x] Implement `executor.ts` with Brain integration and retries.
    - [x] Expose tools in `sop_engine/index.ts`.
- [x] **Documentation**:
    - [x] Create `docs/SOP_ENGINE.md`.

### 6. Phase 5: The Digital Co-worker (Deployment & Persona)
- [x] **Persona Engine**:
    - [x] Create `src/persona.ts`: Load `persona.json` and wrap LLM responses.
    - [x] Implement `inject_personality()` function in `src/llm.ts`.
- [x] **Interfaces**:
    - [x] Create `src/interfaces/slack.ts`: Implement Slack Bolt.js adapter.
    - [x] Create `src/interfaces/teams.ts`: Implement Microsoft Bot Framework adapter.
    - [x] Create `src/interfaces/discord.ts`: Implement Discord.js adapter.
- [x] **Infrastructure**:
    - [x] Create `Dockerfile` for lightweight production image.
    - [x] Create `docker-compose.yml` for local "Agency" simulation (Redis + Agent).
    - [x] ✅ Persona Engine validated with full integration tests

### 7. Phase 6: Enterprise Cognition (The Brain) (✅ Completed)
- [x] **Episodic Memory (Vector DB)**:
    - [x] Evaluate `lancedb` vs `chromadb` (node-compatible).
    - [x] Create `src/brain/episodic.ts`: Implement embedding generation + storage.
    - [x] **Brain production hardening**: Implemented `LanceConnector` and `SemanticGraph` with concurrency locking. Validated via 5-tenant simulation.
- [x] **Semantic Memory (Graph)**:
    - [x] Create `src/brain/semantic.ts`: JSON-based graph store.
    - [x] Implement entity extraction prompt in `src/llm/prompts.ts`.
- [x] **Integration**:
    - [x] Update `ContextManager` to query "The Brain" on initialization.
    - [x] Create `src/mcp_servers/brain`: Expose memory via MCP for sub-agents.
    - [x] **Validation**: Verified `ContextManager` correctly integrates with Brain MCP. `loadContext` recalls relevant past experiences, and `saveContext` persists outcomes to LanceDB. Artifacts are correctly stored and retrieved. Integration tests passed.
    - [x] **Agent Integration**:
        - [x] Integrated Brain with Job Delegator (log experience, recall patterns).
        - [x] Created Reviewer Agent with Brain integration.
- [x] **Company Context (The Briefcase)**:
    - [x] Create `src/mcp_servers/company_context.ts`: Manage multi-tenant RAG via LanceDB.
    - [x] Update `cli.ts` and `engine.ts` to support `--company` flag and context injection.
    - [x] Create `docs/COMPANY_CONTEXT.md`.
    - [x] Validated Company Context with comprehensive E2E tests (including Slack/Teams flags).
    - [x] ✅ Company Context production-tested with multi-tenant isolation

### 8. Phase 7: The Hive Mind (✅ Implemented)
- [x] **Swarm Orchestration**: Implement dynamic agent spawning via `opencowork`.
- [x] **Agent Negotiation**: Implement protocol for agents to "bid" on tasks.
- [x] **Validation**: Verified `spawn_subagent` and `negotiate_task` via `tests/integration/swarm_integration.test.ts` (Brain integration active).

### 9. Phase 8: Recursive Evolution (Active)
- [x] **Self-Repair**: Implement `HR Loop` to fix `src/` files based on error logs (`src/mcp_servers/hr/`).
- [x] **Automated Review**: Integrate HR MCP with Scheduler for weekly automated reviews.
- [x] **Core Update**: Implement secure protocol for updating `engine.ts`.
- [x] **Validation**: Verified `analyze_logs` and `propose_change` with real log files via `tests/integration/hr_operational.test.ts`.
- [x] **Safety Tests**: Core Update safety (Token/YOLO) validated.

### 10. Phase 9: Comprehensive Integration Testing (✅ Implemented)
- [x] **End-to-End Simulation**: Implement `tests/integration/four_pillars_integration.test.ts`.
- [x] **Mocking Strategy**: Advanced mocking for LLM/MCP to ensure fast execution.
- [x] **Validation**: Verify artifacts across all 4 pillars (Context, SOP, Ghost, HR).
- [x] **Production Validation**: Implemented multi-tenant, 4-pillar integration test (`tests/integration/production_validation.test.ts`) for CI/CD pipeline.

### 11. Phase 10.5: Operational Excellence (✅ Implemented)
- [x] **Health Monitor MCP**: Created `src/mcp_servers/health_monitor/` to track metrics.
- [x] **Dashboard**: Created `scripts/dashboard/` for real-time visualization.
- [x] **Integration**: Metrics collection added to core engine and LLM.
- [x] **Alerting**: Configurable threshold alerts via `alert_rules.json`.

### 12. Phase 11: Production Showcase (✅ Implemented)
- [x] **Showcase Corp Context**: Created `demos/simple-cli-showcase/company_context.json`.
- [x] **SOP-as-Code**: Defined end-to-end workflow in `demos/simple-cli-showcase/docs/showcase_sop.md`.
- [x] **Ghost Mode Simulation**: Implemented `demos/simple-cli-showcase/run_demo.ts` to orchestrate 24-hour autonomy.
- [x] **Validation**: Verified full showcase flow via `tests/integration/showcase_simulation.test.ts`.
