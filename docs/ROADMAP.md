# Simple Biosphere Roadmap

**Mission Statement:** [Read the Technical Constitution](../MISSION.md)
**Last Updated:** February 2026

The roadmap is structured around the four anatomical layers of the Digital Biosphere.

## Phase I: The Metabolism (Observability)
*Status: Completed (Foundation Established)*
*Current Focus: High-Fidelity Feedback*
- [x] Implement eBPF probes for real-time telemetry.
- [x] Define "Environmental Stress" metrics (energy, latency, cache hits).
- [x] Build the Feedback Loop to inform the Genome.

## Phase II: The Immune System (Verification)
*Status: Completed (Foundation Established)*
*Current Focus: Autonomous Sentinel Agents*
- [x] Develop "White Blood Cell" agents for constant Red Teaming.
- [x] Implement chaos engineering injection mechanisms.
- [x] Enforce "The 5 Laws of Digital Physics" via automated verification.

## Phase III: The Genome (Symbolic Intent)
*Status: Completed (Foundation Established)*
*Current Focus: Language-Agnostic Graph*
- [x] Design the high-level Invariants and Objectives graph.
- [x] Integrate Z3 solver for formal proof of System State.
- [x] Implement Distributed Merkle DAG storage.

## Phase IV: The Proteome (Executable Phenotype)
*Status: Completed (Foundation Established)*
*Current Focus: Ephemeral Binaries*
- [x] Develop Ribosome Agents for JIT synthesis of binaries (WASM/eBPF).
- [x] Implement the "Disposable Lifecycle" for code modules.
- [x] Enable "Homeostatic Repair" (Self-Healing) workflows.

## Phase V: Autonomous Business Operations
*Status: Completed*
*Current Focus: The Business OS*
- [x] Integrate Financial Operations (Xero).
- [x] Integrate CRM (HubSpot).
- [x] Integrate Project Management (Linear).
- [x] Validate Business Integrations (Playbooks & Tests).
    - ✅ Business Integrations validated via automated playbook tests.
- [x] Elastic Swarms (Auto-scaling based on demand).

## Phase VI: Visual & Desktop Agency
*Status: Completed*
*Current Focus: Polyglot Desktop Orchestrator*
- [x] **Core Architecture**: Implemented `DesktopOrchestrator` with `DesktopDriver` interface.
- [x] **Smart Router**: LLM-based routing between Stagehand, Skyvern, and Computer Use.
- [x] **Drivers**:
    - [x] Stagehand (Local Browser).
    - [x] Skyvern (Vision-based Navigation).
- [x] **Validation**:
    - [x] Validated drivers via `tests/integration/desktop_validation.test.ts`.
    - [x] Validated Visual Quality Gate with aesthetic scoring.
    - [x] Established production SOPs for desktop workflows.

## Phase 8: Recursive Evolution
*Status: Completed*
*Current Focus: Self-Improvement*
- [x] **Core Update**: Implement secure protocol for updating `engine.ts` (Implemented with Dual-Verification Safety Protocol).
- [x] **Enhanced Dreaming with Swarm Intelligence**:
    - Leverages Hive Mind during simulation to negotiate task routing.
    - Spawns specialized sub-agent swarms for optimal problem-solving.
    - Stores collaborative solution patterns in Brain.
    - ✅ Enhanced Dreaming now stores swarm negotiation patterns in Brain for future recall, enabling meta-learning of collaboration strategies.
- [x] **Pattern Application**: Swarm Orchestrator recalls and applies stored negotiation patterns for similar tasks, reducing deliberation time.

## Phase 20: Continuous Real-World Validation
*Status: Completed*
- [x] **Scheduled Runner**: GitHub Actions workflow to run the 24-hour simulation daily.
- [x] **Health Monitor Extension**: MCP module to record and serve showcase metrics.
- [x] **Dashboard Integration**: UI panel to visualize showcase history and status.
- [x] **Documentation**: Updated guides for automated validation.
- [x] **Self-Healing Validation Loop**: Automated analysis and correction of showcase failures.
    - ✅ Phase 20 extended with autonomous healing capabilities.
    - ✅ VALIDATED: Full showcase and self-healing loop verified via `tests/integration/showcase_simulation.test.ts`.

## Phase 21: Autonomous Agency Operations
*Status: Completed*
*Current Focus: End-to-End Business Automation*
- [x] **Client Onboarding Workflow**: Automate full client intake and project setup (PR #538).
    - ✅ Implemented `client_onboarding_workflow` tool in `business_ops` MCP.
    - ✅ Orchestrates Company Context, CRM (HubSpot), Project (Linear), and Finance (Xero).
- [x] **Automated Billing**: Implement invoice generation and payment tracking (PR #539).
    - ✅ Implemented `automated_billing_workflow` and core billing tools in `business_ops`.
    - ✅ Supports invoice creation, sending, and payment recording with Xero integration.
- [x] **CRM Synchronization**: Ensure real-time updates between operations and CRM.
    - ✅ Implemented idempotent `sync_contact_to_crm`, `sync_company_to_crm`, and `sync_deal_to_crm` tools in `business_ops`.
    - ✅ Integrated robust sync logic into `client_onboarding_workflow`.
- [x] **Project Management**: Auto-create and update Linear tasks based on agency activity.
    - ✅ Implemented `create_linear_project`, `create_linear_issue`, and `sync_deal_to_linear` tools.
    - ✅ Integrated into `client_onboarding_workflow` for seamless project setup.
- [x] **Validation**: Verify end-to-end agency workflows via integration tests.
    - ✅ Validated full lifecycle (Onboarding -> CRM -> Linear -> Xero) via `tests/integration/agency_workflow_validation.test.ts`.
    - ✅ Linear integration implemented and validated via end-to-end workflow test.

## Phase 22: Autonomous Client Lifecycle
*Status: Proposed*
*Current Focus: Full Lifecycle Automation & Scaling*
- [x] **Lead Generation**: Automate outreach and lead qualification.
    - ✅ Implemented core discovery, qualification, and outreach tools integrated with HubSpot and Brain.
- [x] **Self-Scaling Swarms**: Dynamic agent allocation per client demand.
    - ✅ Implemented `monitor_workload` tool in `business_ops` MCP to track Linear/Xero metrics.
    - ✅ Integrated `SwarmServer` for dynamic agent spawning and termination.
    - ✅ Added `scaling_rules.json` for configurable thresholds.
    - ✅ Scheduled periodic monitoring via `swarm-scaling-monitor` task.
- [ ] **Project Delivery**: Automated milestone tracking and client reporting.
- [ ] **Offboarding**: Secure project handover and archival.

## Legacy Achievements
See [Legacy Roadmap](ROADMAP_LEGACY.md) for completed milestones of the previous "Simple CLI" era.
