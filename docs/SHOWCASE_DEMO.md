# 🌟 The Simple CLI Showcase: Digital Agency in Action

Welcome to the **Digital Agency Capability** demonstration. This guide shows how Simple CLI transforms from a simple terminal tool into a fully autonomous software engineering workforce that can adopt a company's identity, follow standard procedures, and improve itself over time.

---

## 🏗️ The 4-Pillar Vision in Action

This demo simulates a 24-hour cycle of a digital employee working for "Showcase Corp," a fictional startup. It demonstrates the seamless integration of our four core pillars:

### 1. **Company Context (The Briefcase)**
The agent doesn't just execute commands; it understands *who* it works for.
-   **Input**: `company_context.json` defines the brand voice ("Professional, tech-forward"), tech stack (React, Node.js), and mission.
-   **Action**: The agent ingests this context into its Brain (Vector DB) and uses it to tailor every response and code snippet.
-   **Result**: Code that matches your style guide and PR descriptions that sound like your team.

### 2. **SOP-as-Code (The Operating Manual)**
Professional work follows standards. The agent executes **Standard Operating Procedures (SOPs)** written in Markdown.
-   **Input**: `docs/sops/showcase_sop.md`.
-   **Action**: The SOP Engine parses the checklist ("1. Initialize Repo", "2. Deploy to Staging") and executes each step using available tools (Git, Filesystem).
-   **Result**: Reliable, repeatable project setup without human intervention.

### 3. **Ghost Mode (The 24/7 Employee)**
The agent works while you sleep.
-   **Scenario**: It's 9:00 AM.
-   **Action**: The **Job Delegator** wakes up via CRON, checks the `scheduler.json`, and performs a "Morning Standup."
-   **Result**: A summary of yesterday's work and today's plan is logged to `.agent/ghost_logs/` before you even log in.

### 4. **HR Loop (Recursive Self-Improvement)**
The agency gets smarter every day.
-   **Scenario**: It's 6:00 PM.
-   **Action**: The **HR Manager** (HR Loop MCP) analyzes the day's execution logs for errors or inefficiencies.
-   **Result**: It proposes concrete improvements (e.g., "Update `sop_execute` retry logic") and stores them as proposals in `.agent/hr/proposals/`.

### 5. **Intelligent Nightly Maintenance (Swarm Dreaming)**
The system heals itself using specialized swarm agents.
- **Scenario**: It's 2:00 AM.
- **Action**: The `dreaming` server activates.
    - **Step 1**: It queries the Brain for recent task failures (e.g., "React hydration error on signup page").
    - **Step 2**: It negotiates with the **Swarm Intelligence** to find the best expert.
    - **Step 3**: The Swarm spawns a temporary "Frontend Specialist" sub-agent.
    - **Step 4**: The agent simulates a fix in a sandbox environment.
- **Result**: The failure is resolved, and the solution is stored in the Brain (`resolved_via_dreaming: true`) for future use, preventing the same bug from recurring.

### 6. **Self-Healing Loop (Autonomous Maintenance)**
When things go wrong, the system fixes itself.
- **Scenario**: The nightly showcase run fails due to a network timeout.
- **Action**: The **Showcase Healer** detects the failure, diagnoses it as transient using LLM reasoning, and autonomously triggers a retry via the SOP Engine.
- **Result**: The system recovers without human intervention, and the healing action is logged for auditability.

### 7. **Autonomous Client Onboarding (Agency Ops)**
The agency can scale its client base autonomously.
- **Scenario**: A new lead comes in via the website.
- **Action**: The `client_onboarding_workflow` tool is triggered.
    - **Step 1**: It creates an isolated **Company Context** (Brain, Filesystem, Settings).
    - **Step 2**: It syncs the new client to **HubSpot CRM**.
    - **Step 3**: It sets up a **Linear Project** with the appropriate template (e.g., "Web Dev").
    - **Step 4**: It drafts an initial invoice in **Xero**.
- **Result**: A new client is fully onboarded and ready for work in under 60 seconds.

---

## 🚀 Deployment Instructions

You can run this entire simulation on your local machine in minutes.

### Prerequisites
-   Node.js (v18+)
-   Docker (Optional, for production mode)
-   OpenAI API Key (or compatible LLM key)

### Quickstart: The Simulation (Recommended)
This runs a self-contained "Time Lapse" of the 24-hour cycle immediately.

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/stan-chen/simple-cli.git
    cd simple-cli
    npm install
    ```

2.  **Run the Showcase**:
    ```bash
    npm run demo
    ```

3.  **Watch the Magic**:
    The CLI will output the agent's thought process as it:
    -   Initializing MCP Servers...
    -   Loading Showcase Corp Context...
    -   Executing `showcase_sop.md`...
    -   Triggering Morning Standup...
    -   Performing Daily HR Review...

### CLI Installation (Interactive Mode)
To install "Showcase Corp" into your main CLI environment and interact with it manually:

1.  **Run the Setup Script**:
    ```bash
    npx tsx scripts/setup-showcase.ts
    ```

2.  **Switch Context**:
    ```bash
    simple company switch showcase-corp
    ```

### Production Deployment: Docker (Ghost Mode)
To deploy the agent as a background service that runs 24/7:

1.  **Configure Environment**:
    Ensure your `.env` file has your API keys.

2.  **Start the Container**:
    Navigate to the showcase directory and use Docker Compose:
    ```bash
    cd demos/simple-cli-showcase
    docker compose -f docker-compose.prod.yml up -d --build
    ```

3.  **Verify Operation**:
    Check the logs to see the daemon starting up:
    ```bash
    docker compose -f docker-compose.prod.yml logs -f
    ```

---

## 📂 Configuration Artifacts

### 1. `docker-compose.prod.yml`
Optimized for "One-Click" deployment of the Digital Agency.
```yaml
version: '3.8'
services:
  showcase-agent:
    image: simple-cli:latest
    volumes:
      - ./.agent:/app/.agent
      - ./company_context.json:/app/company_context.json
      - ./docs/sops:/app/showcase_sops
    environment:
      - JULES_AGENT_DIR=/app/.agent
      - JULES_SOP_DIR=/app/showcase_sops
    command: >
      sh -c "
        mkdir -p /app/.agent/companies/showcase-corp/docs &&
        # ... (context loading logic) ... &&
        node dist/daemon.js
      "
    restart: unless-stopped
```

### 2. Validation Results (Autonomous Operation)
The system is rigorously tested. Below is an excerpt from our validation suite (`tests/integration/showcase_simulation.test.ts`):

```text
PASS tests/integration/showcase_simulation.test.ts
  Showcase Simulation Integration Test
    ✓ should execute the full Showcase scenario: Context, SOP, Ghost Mode, HR Loop
    ✓ should activate self-healing loop on failure

Test Suites: 1 passed, 1 total
Tests:       2 passed, 2 total
```

### 3. Generated Logs (Example)
After running the demo, check `.agent/ghost_logs/`:

**`standup_2023-10-27.md`**:
> **Morning Standup**
> - **Yesterday**: Initialized project repo, deployed to staging.
> - **Today**: Monitoring error rates.
> - **Blockers**: None.

**`hr_review_2023-10-27.md`**:
> **Daily HR Review**
> - **Analysis**: 2 SOP steps failed initially but succeeded on retry.
> - **Proposal**: Increase default timeout for `git push` operations.
> - **Status**: PENDING APPROVAL.

### 4. Automated Daily Validation
The showcase is validated daily via a GitHub Actions workflow.

- **Check Results**: Visit the Health Monitor dashboard (`http://localhost:3000`) and see the "Showcase Validation" panel.
- **Run Manually**:
    ```bash
    npx tsx scripts/showcase-runner.ts
    ```
- **See Logs**: Check `.agent/health_monitor/showcase_runs.json` or CI artifacts.

---

## 🏢 Managing Multiple Companies

The enhanced Company Context system allows you to manage multiple client environments seamlessly using the CLI:

1.  **Initialize**: `simple init-company <name>` (Creates context, SOPs, and Brain)
2.  **Switch**: `simple company switch <name>` (Sets active context)
3.  **List**: `simple company list` (View active and archived companies)
4.  **Archive**: `simple company archive <name>` (Deactivate and move to storage)
5.  **Status**: `simple company status` (Check current context)

---

## ✅ Validation Run (Latest)

**Date**: 2024-05-22
**Status**: PASSED

The Phase 20 Showcase was validated via the robust integration test suite `tests/integration/showcase_simulation.test.ts`. This validation covered:
1.  **Full Lifecycle Simulation**: Successful execution of Company Context loading, SOP execution, Ghost Mode tasks, and HR Loop.
2.  **Self-Healing Loop**: Verification that the `ShowcaseHealer` correctly detects failures and triggers retry mechanisms via the SOP Engine.

## 🔗 Next Steps

-   **[View the Roadmap](ROADMAP.md)**: Phase 20 is now Completed.
-   **[Read the Specs](specs.md)**: Deep dive into the technical architecture.
-   **[Try it Yourself](#quickstart-the-simulation-recommended)**: Run `npm run demo` now!

## 🏭 Advanced: Production Load Simulation

To validate the **Phase 23 Autonomous Agency Governance** layer, we provide a comprehensive load simulator that mimics a high-traffic production environment.

### What it Does
-   **Simulates 10+ Concurrent Clients**: Creates virtual Company Contexts and generates realistic Linear issue activity.
-   **Swarm Fleet Management**: Stresses the `scaling_engine` to ensure swarms are spawned and balanced dynamically.
-   **Predictive Health**: Triggers interventions for "at-risk" clients based on simulated metrics.
-   **Enhanced Dreaming**: Verifies that the HR Loop detects cross-swarm patterns and generates SOPs.

### How to Run
Execute the validation suite:
```bash
npm test -- tests/integration/production_load_validation.test.ts
```

### Expected Output
You will see the `ProductionLoadSimulator` initialize, generate load, and log key events:
```text
[SIM] [T+12h] Generating simulated load...
[SIM] [T+12h] Generated 15 new issues across fleet.
[SIM] [T+12h] Evaluating fleet demand...
[SIM] [T+12h] Evaluation result: 2 Scale Up, 1 Scale Down.
[SIM] [T+12h] Balancing fleet resources...
[SIM] [T+12h] Executed 2 balancing actions.
...
[SIM] Finalizing simulation: Analyzing cross-swarm patterns...
[SIM] SOP generation triggered.
```
