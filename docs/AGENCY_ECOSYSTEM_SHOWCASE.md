# Phase 33: Agency Ecosystem Showcase

## Mission
Demonstrate the main Simple-CLI agency orchestrating a complex, multi-faceted project by autonomously spawning and coordinating multiple specialized child agencies. This showcase validates the full meta-orchestration capabilities developed post-Phase 32, including the Agency Spawning Protocol, Federation Protocol, and Autonomous Strategic Decision Engine.

## Architecture & Participants
The showcase operates as a parent-child hierarchy, leveraging the **Meta-Orchestrator** and **Federation Protocol**.

**Root Agency (Orchestrator):**
- **Role:** Project Manager, Strategic Decision Maker, Resource Allocator.
- **Responsibilities:**
  - Parse the complex project specification (`complex_project_spec.md`).
  - Spawn specialized child agencies.
  - Delegate sub-tasks to child agencies.
  - Monitor progress and aggregate metrics into a Project Dashboard.
  - Resolve cross-agency resource conflicts using the Strategic Decision Engine (Phase 30).

**Child Agencies (Specialists):**
1. **Frontend Specialists:** Focuses on Vue 3 UI/UX implementation and frontend testing.
2. **Backend Engineers:** Focuses on Node.js API development, database schemas, and backend testing.
3. **DevOps Team:** Focuses on CI/CD pipelines, Docker containerization, and deployment playbooks.

## Infrastructure Highlights
- **Agency Spawning Protocol (Phase 32):** Child agencies are instantiated with isolated contexts (separate `EpisodicMemory` namespaces) but connected via the Federation Protocol.
- **Federation Protocol & Distributed Ledger (Phase 31):** Agencies communicate capabilities, request tasks from each other, and track resource usage (e.g., LLM tokens) on the ledger.
- **Collective Learning (Phase 31):** Child agencies sync successful patterns to a shared namespace, enabling the Root Agency to perform cross-agency pattern recognition.
- **Strategic Decision Engine (Phase 30):** When two agencies request the same constrained resource (e.g., token budget exceeded), the Root Agency intervenes, evaluating priorities and adjusting allocations automatically.

## Running the Showcase

### 1. Simulated Dry Run (CI/CD Validation)
The dry run script executes the showcase logic without consuming actual LLM tokens or real-world compute. It mocks the decision-making and file I/O to ensure the orchestration logic is sound.

```bash
npx tsx demos/agency_ecosystem_showcase/dry_run.ts
```

### 2. Full Execution
*Warning: This will consume actual LLM tokens and system resources. Ensure your `token_budget` and API keys are properly configured.*

```bash
npx tsx demos/agency_ecosystem_showcase/orchestration_script.ts
```

## Expected Outcomes
1. **Successful Spawning:** Three distinct `.agent/` directories (or simulated environments) are created with correct profiles and token budgets.
2. **Task Delegation:** The Root Agency successfully parses the `complex_project_spec.md` and assigns the frontend, backend, and DevOps tasks to the respective agencies.
3. **Cross-Agency Collaboration:** The DevOps agency waits for (or mocks waiting for) the Backend and Frontend agencies to complete their tasks before finalizing the CI/CD pipeline.
4. **Conflict Resolution:** A simulated token constraint conflict is injected; the Root Agency detects it and successfully reallocates budget from an idle agency to the blocked agency.
5. **Dashboard Generation:** A final Markdown report is generated detailing the time to completion, tokens used per agency, and overall project success.
