# Deployment Playbook: Agency Consulting (Real-World Scenario)

**Scenario:** A boutique digital agency ("PixelForge Digital") manages multiple client projects simultaneously. They need to ensure strict data isolation between clients, automate repetitive deliverables, and provide 24/7 monitoring for critical client infrastructure.

**Persona:** "PixelForge Digital" - A team of 5 developers managing 10+ active clients ranging from E-commerce startups to Healthcare providers.

**Challenges:**
-   **Context Switching:** Developers lose time switching between client tech stacks (React vs. Vue, AWS vs. Azure).
-   **Consistency:** Ensuring all client reports and deployments follow the same high standard.
-   **Data Privacy:** Client A's data must NEVER leak to Client B.

**Solution:** Use Simple-CLI's multi-tenant "Company Context" to isolate environments and the "Smart Router" to optimize costs.

---

## 1. Prerequisites

Before starting, ensure you have the following installed:
*   **Node.js** (v22+)
*   **Docker** & **Docker Compose**
*   **Simple-CLI** (`npm install -g @stan-chen/simple-cli`)
*   **Git** (for version control)

---

## 2. Multi-Tenant Setup (The "Silo" Strategy)

We will initialize separate "Company Contexts" for two distinct clients. This ensures that the Brain, SOPs, and configuration for each client are physically isolated on the filesystem.

### Client A: E-Commerce Startup ("ShopFast")
```bash
simple init-company shopfast-inc
```
**Configuration (`.agent/companies/shopfast-inc/config/company_context.json`):**
```json
{
  "name": "ShopFast Inc.",
  "tech_stack": "Next.js, Shopify, Vercel",
  "brand_voice": "Energetic, Youthful, Direct",
  "constraints": ["Mobile-first design", "SEO-optimized"]
}
```

### Client B: Healthcare Provider ("MedSecure")
```bash
simple init-company medsecure-health
```
**Configuration (`.agent/companies/medsecure-health/config/company_context.json`):**
```json
{
  "name": "MedSecure Health",
  "tech_stack": "Java Spring Boot, AWS HIPAA-Compliant Cloud",
  "brand_voice": "Professional, Trustworthy, Clinical",
  "constraints": ["HIPAA Compliance", "No PII in logs", "Audit trails required"]
}
```

**Switching Contexts:**
To work on a specific client, simply switch the active context:
```bash
simple company switch shopfast-inc
# The agent now "thinks" like a ShopFast developer.
```

---

## 3. SOP-as-Code: Automating Agency Deliverables

Agencies thrive on repeatable processes. We define SOPs once and execute them for any client.

### Example: Client Onboarding
Create `docs/sops/client_onboarding.md` (shared or per-company):
```markdown
# Client Onboarding SOP

1. **Repository Setup**
   - Create a new private GitHub repository.
   - Initialize with standard agency `.gitignore` and `README.md`.

2. **Environment Configuration**
   - generate `.env.example`.
   - Set up CI/CD pipeline (GitHub Actions).

3. **Team Access**
   - Invite client stakeholders to the repo.
   - Set up Slack channel integration.
```

**Execute for ShopFast:**
```bash
simple company switch shopfast-inc
simple sop client_onboarding
```

### Example: Weekly Reporting
Create `docs/sops/weekly_report.md`:
```markdown
# Weekly Progress Report

1. **Summarize Work**
   - Scan git commit log for the past 7 days.
   - Group by feature/bugfix.

2. **Check Metrics**
   - Query Vercel/AWS for uptime and latency.

3. **Draft Email**
   - Generate a draft email to the client using the defined "Brand Voice".
   - Save to `reports/week_X.txt`.
```

---

## 4. Ghost Mode: 24/7 "Shadow" Support

Agencies can't monitor screens 24/7. "Ghost Mode" allows the agent to perform background checks and alert the team only when necessary.

### Use Case 1: Critical Infrastructure (MedSecure)
Edit `.agent/companies/medsecure-health/config/company_context.json`:

```json
{
  "ghost_mode": {
    "enabled": true,
    "tasks": [
      {
        "id": "health-check-monitor",
        "name": "Hourly Health Check",
        "schedule": "0 * * * *",
        "prompt": "Check the AWS CloudWatch alarms for the production DB. If CPU > 80%, alert the #dev-ops channel immediately."
      }
    ]
  }
}
```

### Use Case 2: Daily Standups (ShopFast)
Automate the daily standup preparation for the ShopFast team.

**Edit `.agent/companies/shopfast-inc/config/company_context.json`:**
```json
{
  "ghost_mode": {
    "tasks": [
      {
        "id": "daily-standup-prep",
        "name": "Daily Standup Notes",
        "schedule": "0 9 * * 1-5", // 9 AM, Mon-Fri
        "prompt": "Scan GitHub issues closed yesterday and pending PRs. Draft a bulleted summary for the team standup in Slack #shopfast-daily."
      }
    ]
  }
}
```

**Activate:**
```bash
simple daemon start
```
*The agent will now run concurrently for both clients, respecting their individual schedules and contexts.*

---

## 5. Dashboard Setup: Monitoring All Clients

As an agency owner, you need a "Control Tower" to see the health of all client projects at a glance.

**Launch the Operational Dashboard:**
```bash
simple dashboard
```

**What you see:**
*   **Multi-Tenant View:** The dashboard aggregates metrics (Token Usage, Success Rate, Errors) from all companies defined in `.agent/config.json`.
*   **Cost Per Client:** Determine exactly how much `ShopFast` vs. `MedSecure` is costing you in API fees.
*   **Anomalies:** The **Health Monitor** highlights unusual activity (e.g., a spike in error rates for MedSecure) using predictive analytics.

**Alert Configuration:**
Set up alerts for cost overruns in `scripts/dashboard/alert_rules.json`:
```json
[
  {
    "metric": "shopfast-inc:total_cost",
    "operator": ">",
    "threshold": 50.00,
    "contact": "finance-slack-webhook"
  }
]
```

---

## 6. The "Smart Router" ROI Calculation

For an agency, margins are everything. The Smart Router optimizes costs by delegating simple tasks to cheaper models and complex tasks to premium ones.

**Task Delegation Strategy:**

| Task Type | Model Used (Auto-Selected) | Cost Estimate |
| :--- | :--- | :--- |
| **Fix typo in README** | DeepSeek V3 (via Aider) | < $0.01 |
| **Generate Weekly Report** | GPT-4o Mini / Claude Haiku | ~ $0.05 |
| **Debug Race Condition** | Claude 3.5 Sonnet / O1 | ~ $0.50 - $2.00 |
| **Architectural Review** | Claude 3.7 Sonnet | ~ $1.50 |

**ROI Impact:**
By using the Smart Router instead of defaulting to GPT-4 for everything, PixelForge **reduces API costs by ~60%**, allowing them to maintain higher margins on retainer contracts.

---

## 7. The HR Loop: Continuous Agency Improvement

The HR Loop ensures that lessons learned from one client can (anonymously) improve processes for others, while maintaining strict data isolation.

**Scenario:**
The agent notices that deployments for *ShopFast* often fail due to missing environment variables.

**HR Action:**
1.  **Analyze:** The HR agent scans `sop_logs.json` and detects a pattern of failure in the "Deploy" step.
2.  **Propose:** It suggests adding a "Verify Env Vars" step to the master `deployment_sop.md`.
3.  **Apply:** Once approved, you can manually promote this improved SOP to your "Agency Templates" folder, making it available for *MedSecure* and future clients.
    *   *Note: Client data remains in the client's Brain. Only the generic process improvement is shared.*

---

## Conclusion

By adopting Simple-CLI, PixelForge Digital has transformed from a chaotic, reactive agency into a scalable, proactive consultancy.
-   **Isolation:** strict data boundaries per client.
-   **Automation:** Repeatable SOPs for onboarding and reporting.
-   **Reliability:** 24/7 monitoring via Ghost Mode.
-   **Profitability:** optimized token usage via Smart Router.

**Next Steps:**
-   [ ] Initialize your first client using `simple init-company`.
-   [ ] Draft your "Agency Standard" SOPs.
-   [ ] Enable Ghost Mode for your most critical accounts.
