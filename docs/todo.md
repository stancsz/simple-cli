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
    - [x] **Automated Analyzer**: Implemented `framework_analyzer` to semi-automate the Ingest-Digest cycle (Phase 16).
    - [x] **Enhanced Analyzer**: Added support for SDK/API (Files/URLs) and GUI analysis (Phase 16 complete).
    - [x] **Validation**: Verified `framework_analyzer` via `tests/integration/framework_analyzer_validation.test.ts` and `tests/integration/framework_analyzer_enhanced.test.ts`.

### Token Efficiency & Memory
- [x] **Shared Brain Architecture**: `.agent/brain/` for all agents
    - [x] Vector DB (episodic memory)
    - [x] Graph DB (semantic memory)
    - [x] Eliminates redundant context passing (70% token reduction)

**Next Frameworks to Ingest:**
- [x] **Windsurf** (collaborative coding)
- [x] **Bolt.new** (rapid prototyping)
- [x] **v0.dev** (UI generation)
- [x] **Gemini** (Multimodal AI)
- [x] **Stagehand** (browser automation)

## Sprint 3: Expanding the Framework Ecosystem (✅ Completed)
- [x] **SWE-agent** (Autonomous Software Engineering) - Integrated via Automated Framework Analyzer.

## Sprint 0.5: Local AI Stack (Dify) (✅ Completed)

**Goal:** Provide a local, privacy-first orchestration layer for rapid prototyping.

- [x] **Setup Dify locally for coding project**: Created `docker-compose.dify.yml`.
- [x] **Configure Supervisor Agent**: Added `dify_agent_templates/supervisor_agent.json`.
- [x] **Configure Coding Agent**: Added `dify_agent_templates/coding_agent.json`.
- [x] **Documentation**: Added `docs/LOCAL_DIFY.md`.
- [x] **Smart Router Integration**: Updated `src/skills.ts` and `sop_engine` to delegate privacy-sensitive tasks to Dify.

## Sprint 1: The Awakening (✅ Completed)

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
    - [x] **Persona Integration**: Integrated working hours, typing indicators, and styled responses across Slack, Teams, and Discord.
    - [x] **Audit & Enhancement**: Completed deep integration audit (Working hours, typing delays, reactions, voice consistency) and validation via `tests/integration/persona_integration.test.ts`.
- [x] **Infrastructure**:
    - [x] Create `Dockerfile` for lightweight production image.
    - [x] Create `docker-compose.yml` for local "Agency" simulation (Redis + Agent).
    - [x] ✅ Persona Engine validated with full integration tests

### 7. Phase 6: Enterprise Cognition (The Brain) (✅ Completed)
- [x] **Episodic Memory (Vector DB)**:
    - [x] Evaluate `lancedb` vs `chromadb` (node-compatible).
    - [x] Create `src/brain/episodic.ts`: Implement embedding generation + storage.
    - [x] **Brain production hardening**: Implemented `LanceConnector` and `SemanticGraph` with concurrency locking. Validated via 12-tenant simulation.
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
    - [x] ✅ Company Context production-tested with multi-tenant isolation and high-concurrency (12 tenants).
    - [x] **Automated Onboarding**: Implemented `simple onboard-company` command (6-Pillar Setup).

### 8. Phase 7: The Hive Mind (✅ Implemented)
- [x] **Swarm Orchestration**: Implement dynamic agent spawning via `opencowork`.
- [x] **Agent Negotiation**: Implement protocol for agents to "bid" on tasks.
- [x] **Validation**: Verified `spawn_subagent` and `negotiate_task` via `tests/integration/swarm_integration.test.ts` (Brain integration active).

### 9. Phase 8: Recursive Evolution (Active)
- [x] **Self-Repair**: Implement `HR Loop` to fix `src/` files based on error logs (`src/mcp_servers/hr/`).
- [x] **Automated Review**: Integrate HR MCP with Scheduler for weekly automated reviews (Production Daemon Integrated).
- [x] **Dreaming (Offline Simulation)**: Implemented `src/mcp_servers/dreaming/` and integrated with Scheduler.
- [x] **Core Update**: Implement secure protocol for updating `engine.ts` (Implemented with Dual-Verification Safety Protocol).
- [x] **Validation**: Verified `analyze_logs` and `propose_change` with real log files via `tests/integration/hr_operational.test.ts`.
- [x] **Safety Tests**: Core Update safety (Token/YOLO) validated.

### 10. Phase 9: Comprehensive Integration Testing (✅ Implemented)
- [x] **End-to-End Simulation**: Implement `tests/integration/four_pillars_integration.test.ts`.
- [x] **Mocking Strategy**: Advanced mocking for LLM/MCP to ensure fast execution.
- [x] **Validation**: Verify artifacts across all 4 pillars (Context, SOP, Ghost, HR).
- [x] **Production Validation**: Implemented multi-tenant, 4-pillar integration test (`tests/integration/production_validation.test.ts`) for CI/CD pipeline.

### 11. Phase 10.5: Operational Excellence (✅ Implemented)
- [x] **Health Monitor MCP**: Created `src/mcp_servers/health_monitor/` to track metrics and serve the dashboard.
- [x] **Dashboard UI**: Enhanced `scripts/dashboard/` with a multi-tenant, visual web UI and natural language summaries.
- [x] **CLI Command**: Added `simple dashboard` to launch the operational view.
- [x] **Integration**: Metrics collection added to core engine and LLM.
- [x] **Alerting**: Configurable threshold alerts via `alert_rules.json`.

### 12. Phase 11: Production Showcase (✅ Implemented)
- [x] **Showcase Corp Context**: Created `demos/simple-cli-showcase/company_context.json`.
- [x] **SOP-as-Code**: Defined end-to-end workflow in `demos/simple-cli-showcase/docs/showcase_sop.md`.
- [x] **Ghost Mode Simulation**: Implemented `demos/simple-cli-showcase/run_demo.ts` to orchestrate 24-hour autonomy.
- [x] **Validation**: Verified full showcase flow via `tests/integration/showcase_simulation.test.ts`.
- [x] **Documentation**: Created `docs/SHOWCASE_DEMO.md` with deployment guide.

### 13. Phase 12: Production-Grade Kubernetes Deployment (✅ Completed)
- [x] **Helm Chart**: Created `deployment/chart/simple-cli` with StatefulSets and Sidecars.
- [x] **Multi-Tenancy**: Validated namespace isolation and `company` injection.
- [x] **Persistence**: Validated PVC logic and Brain/Agent storage.
- [x] **Validation**: Implemented simulated K8s integration tests `tests/integration/k8s_production_validation.test.ts`.
- [x] **Documentation**: Added `docs/K8S_DEPLOYMENT.md`.

### 14. Phase 13: Community & Ecosystem (✅ Completed)
- [x] **User-Friendly Website**: Host a documentation site on GitHub Pages. (Live at https://stan-chen.github.io/simple-cli/)
- [x] **Interactive Quick Start**: Implemented menu-driven wizard (`simple quick-start`) covering the 4 pillars.
- [x] **Enhanced First-Day Experience**: Implemented `simple onboard` for a comprehensive 6-pillar setup.
- [x] **Roo Code Integration**: Full integration case study (`docs/TUTORIAL_ROO_CODE_INTEGRATION.md`).
- [x] **Getting Started Tutorial**: Create a comprehensive guide for new users (`docs/GETTING_STARTED.md`).
- [x] **Contribution Guidelines**: Establish clear guidelines for contributors.

### 15. Phase 14: Visual & Desktop Agency (✅ Enhanced: Polyglot Orchestrator)
- [x] **Core Architecture**:
    - [x] Implemented `DesktopOrchestrator` server.
    - [x] Created `DesktopDriver` interface for polyglot support.
- [x] **Smart Router**:
    - [x] Implemented LLM-based routing logic.
    - [x] Added support for `preferred_backend` configuration.
- [x] **Drivers**:
    - [x] **Stagehand**: Ported existing functionality.
    - [x] **Skyvern**: Implemented fully functional driver with Playwright + Vision API.
    - [x] **Polyglot Stubs**: Created skeleton drivers for Anthropic, OpenAI.
- [x] **Validation**:
    - [x] Integration tests for routing and driver selection.
    - [x] **Visual Quality Gate**: Implemented automated aesthetic validation and retry logic.
    - [x] **Production Hardening**: Validated via `tests/integration/desktop_validation.test.ts` and `docs/DESKTOP_AGENCY_VALIDATION.md`.
    - [x] **SOP Verification**: Created production workflows in `sops/desktop_workflows/`.

## Sprint 4: Autonomous Pipeline (✅ Completed)

**Goal:** Fully automate the framework integration process.

### Phase 17: Autonomous Integration Pipeline (✅ Completed)
- [x] **Scaffold & Test**: `framework_analyzer` generates `basic.test.ts`.
- [x] **Sandboxed Execution**: `framework_analyzer` spawns the server and runs the test.
- [x] **Auto-Registration**: Validated servers are added to `mcp.staging.json`.
- [x] **Validation**: `tests/integration/framework_analyzer_autonomous.test.ts` passes.

## Sprint 5: Ecosystem Expansion (✅ Completed)

**Goal:** Expand the integrated framework ecosystem and validate the platform in real-world production deployments.

### Phase 18: Ecosystem Expansion & Real-World Validation
- [x] **Framework Blitz**: Integrate 13+ new AI frameworks (Jules, Aider, CrewAI, Kimi, Devin, Picoclaw, Cursor, v0.dev, Windsurf, Bolt.new, Gemini, Roo Code, SWE-agent).
- [x] **Deployment Playbooks**: Create deployment guides for 3 real-world scenarios (3/3 Completed - Startup MVP, Enterprise Migration, Agency Consulting).
- [x] **Performance Benchmarking**: Establish a public benchmark suite (✅ Dashboard Integrated).

## Sprint 6: Autonomous Business Operations (✅ Completed)

**Goal:** Transform Simple-CLI into a comprehensive Business OS.

### Phase 19: Business MCP Server & Scaling
- [x] **Business MCP Server**: Scaffold implemented with mock tools (`business_ops`).
- [x] **Financial Integration**: Connect to Xero/QuickBooks APIs.
- [x] **CRM Integration**: Connect to HubSpot/Salesforce APIs.
- [x] **Project Management**: Connect to Linear/Jira APIs.
- [x] **Business Integration Validation**: Validated end-to-end workflows (Startup MVP, Enterprise Migration, Agency Consulting) via `docs/DEPLOYMENT_PLAYBOOKS.md` and integration tests.
- [x] **Production Playbooks**: Validated business logic via `docs/business_playbooks/` and automated integration tests (`tests/integration/business_workflows.test.ts`).
- [x] **Elastic Swarms**: Implement self-replicating agents based on demand.

### 16. Phase 20: Continuous Real-World Validation (✅ Completed)
- [x] **Automated Showcase**: Run 24h simulation daily via GitHub Actions.
- [x] **Health Monitor**: Track metrics for long-term reliability.
- [x] **Dashboard**: Visualize validation status.
- [x] **Self-Healing Loop**: Validated via `tests/integration/showcase_simulation.test.ts`.

## Sprint 7: Autonomous Agency Operations (In Progress)

**Goal:** End-to-End Business Automation.

### Phase 21: Agency Operations
- [x] **Client Onboarding Workflow**: Automate full client intake and project setup (PR #538).
- [x] **Automated Billing**: Implement invoice generation and payment tracking (PR #539).
    - [x] Core Billing Tools (`create_invoice`, `send_invoice`, `record_payment`).
    - [x] Automated Workflow (`automated_billing_workflow`).
    - [x] Integration Tests (Xero Sandbox).
    - [x] Playbook Documentation (`docs/business_playbooks/automated_billing.md`).
- [x] **CRM Synchronization**:
    - [x] Implement core sync tools (`sync_contact`, `sync_deal`, `sync_company`).
    - [x] Integrate with `client_onboarding_workflow`.
    - [x] Integration Tests (HubSpot Mock).
    - [x] Playbook Documentation (`docs/business_playbooks/crm_synchronization.md`).
- [x] **Project Management**:
    - [x] Implement Linear MCP Tools (`create_project`, `create_issue`, `sync_deal`).
    - [x] Integrate with `client_onboarding_workflow`.
    - [x] Integration Tests (Linear SDK Mock).
    - [x] Playbook Documentation (`docs/business_playbooks/project_management_automation.md`).
- [x] **End-to-End Validation**:
    - [x] Full Lifecycle Test (`tests/integration/agency_workflow_validation.test.ts`).

## Sprint 8: Autonomous Client Lifecycle (New)

**Goal:** Automate the entire client lifecycle from discovery to offboarding.

### Phase 22: Lead Generation & Scaling
- [x] **Lead Generation**:
    - [x] Create `src/mcp_servers/business_ops/tools/lead_generation.ts`.
    - [x] Implement `discover_leads`, `qualify_lead`, `initiate_outreach`.
    - [x] Integrate with HubSpot (Notes/Contacts) and Brain (Episodic Memory).
    - [x] Create SOP (`sops/lead_generation_workflow.md`).
    - [x] Validation: `tests/integration/lead_generation_validation.test.ts`.
- [x] **Self-Scaling Swarms**:
    - [x] Create `src/mcp_servers/scaling_engine/` and `scaling_orchestrator.ts`.
    - [x] Implement `evaluate_demand` and `scale_swarm` tools.
    - [x] Register tools in `business_ops`.
    - [x] Create SOP (`sops/self_scaling_swarm_workflow.md`).
    - [x] Validation: `tests/integration/scaling_engine_validation.test.ts`.
