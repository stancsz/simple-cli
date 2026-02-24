# Deployment Playbook: Startup MVP (Real-World Scenario)

**Scenario:** A startup needs to rapidly build and deploy a Minimum Viable Product (MVP) - a simple Todo List app with Authentication. They need a scalable, multi-tenant architecture from Day 1 to support future growth.

**Target Infrastructure:** AWS EKS / GKE / AKS or Local Minikube.
**Framework:** Roo Code (for rapid feature development).

---

## 1. Prerequisites

Before starting, ensure you have the following installed:
*   **Node.js** (v22+)
*   **Docker** & **Docker Compose**
*   **Simple-CLI** (`npm install -g @stan-chen/simple-cli`)
*   **Cloud CLI** (e.g., `aws`, `gcloud`, `az`)
*   **Kubectl** & **Helm** (for production deployment)

---

## 2. Company Context Initialization

First, we create a dedicated "Company Context" for the startup. This initializes the Brain, file structure, and vector database.

```bash
simple init-company startup-mvp
```

**What happens:**
*   Creates `.agent/companies/startup-mvp/`.
*   Initializes `config/company_context.json` (Brand Voice, Tech Stack).
*   Sets up `brain/` (LanceDB) for long-term memory.
*   Activates "Startup MVP" as the current context.

**Verification:**
```bash
ls -F .agent/companies/startup-mvp/
# Output: brain/ config/ docs/ sops/
```

---

## 3. Framework Integration (Roo Code)

We need a coding agent. We'll integrate "Roo Code" using the Automated Framework Analyzer.

```bash
simple integrate-framework roo-code
```

**What happens:**
*   The Analyzer scans Roo Code's CLI/SDK.
*   Generates an MCP server in `src/mcp_servers/roo-code/`.
*   Validates the integration via a generated test.
*   Registers `roo-code` in `mcp.json`.

**Verification:**
```bash
cat mcp.json | grep roo-code
```

---

## 4. SOP Execution: Build the MVP

We define a Standard Operating Procedure (SOP) to build the app systematically.

**Create SOP file:** `docs/sops/build_mvp.md`
```markdown
# Build MVP SOP

1. **Scaffold Project**
   - Use `npx create-next-app@latest todo-app --typescript --tailwind --eslint`.
   - Initialize Git repository.

2. **Add Authentication**
   - Install NextAuth.js.
   - Configure GitHub Provider.

3. **Implement CRUD Features**
   - Create Todo model (Prisma/SQLite).
   - Create API routes.
   - Build Frontend UI.

4. **Deploy**
   - Dockerize the application.
   - Push to registry.
   - Deploy to Kubernetes using Helm.
```

**Execute the SOP:**
```bash
simple sop build_mvp
```

**What happens:**
*   The SOP Engine reads the Markdown.
*   It executes each step using available tools (Filesystem, Terminal, Roo Code).
*   It logs progress to the Brain.

---

## 5. Ghost Mode Configuration (24/7 Autonomy)

Configure background agents to handle maintenance while the team sleeps.

**Edit** `.agent/companies/startup-mvp/config/company_context.json`:
```json
{
  "ghost_mode": {
    "enabled": true,
    "tasks": [
      {
        "id": "morning-standup",
        "name": "Morning Standup",
        "schedule": "0 9 * * *",
        "prompt": "Check GitHub issues and summarize pending tasks."
      }
    ]
  }
}
```

**Activate Ghost Mode:**
```bash
simple daemon start
```

---

## 6. HR Loop Setup (Continuous Improvement)

Enable the HR Loop to analyze logs and optimize workflows weekly.

**Command:**
```bash
simple hr --schedule "weekly"
```

**What happens:**
*   Analyzes `sop_logs.json`.
*   Identifies bottlenecks (e.g., "Step 2 took too long").
*   Proposes updates to `build_mvp.md` or code refactors.

---

## 7. Production Monitoring

Launch the Operational Dashboard to monitor agent health and costs.

```bash
simple dashboard
```

---

## 8. Financial Operations (Business OS)

Manage your startup's finances directly from the CLI using the **Financial Ops** server.

**Create a Customer & Subscription:**
```bash
simple run "Create a Stripe customer for 'Early Adopter' (early@example.com) and subscribe them to the 'Pro Plan' (price_123)."
```

**Track Run Rate:**
```bash
simple run "Check current Stripe balance and list latest invoices."
```

The agent uses `financial_ops` tools to execute these requests and logs the transactions to the Brain for future reference.

**Access:** Open `http://localhost:3000` in your browser.
**Metrics:**
*   **Token Usage:** Cost per feature.
*   **Success Rate:** SOP step completion rate.
*   **Anomalies:** Detected by Health Monitor.

---

## 9. Troubleshooting

**Issue:** Framework integration fails.
**Solution:** Ensure the target tool is installed and in your PATH. Check `src/mcp_servers/framework_analyzer/logs/`.

**Issue:** SOP gets stuck.
**Solution:** Check `.agent/brain/sop_logs.json`. If a step fails repeatedly, manually intervene or update the SOP instructions.

**Issue:** Ghost Mode not triggering.
**Solution:** Check `simple daemon status` and ensure `company_context.json` has valid cron expressions.
