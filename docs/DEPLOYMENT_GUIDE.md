# Deployment Guide

This guide covers how to deploy Simple CLI in production, configure multi-tenant environments, and automate operations.

## Prerequisites

- **Node.js**: 22.12.0+ (for local development)
- **Docker & Docker Compose**: 24.0+ (recommended for production)
- **Kubernetes**: 1.25+ (for enterprise scaling)
- **API Keys**: OpenAI, Anthropic, Gemini, etc.

---

## 1. Quick Start (One-Command Deployment)

### Option A: Docker Compose (Recommended for Small Teams)
Deploy the full stack (Agent, Brain, Redis, Health Monitor) with a single command:

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your API keys

# 2. Launch
docker-compose up -d
```

Access the dashboard at `http://localhost:3000` (if configured) or check logs:
```bash
docker-compose logs -f agent
```

### Option B: Kubernetes (Enterprise)
Deploy to any K8s cluster using our Helm chart:

```bash
# 1. Add repo (simulated for now, use local path)
# helm repo add simple-agency https://charts.simple-agency.com

# 2. Install
helm install simple-cli ./deployment/chart/simple-cli \
  --set company="default-company" \
  --set persistence.enabled=true
```

---

## 2. Company Context Setup (Wizard)

For agencies managing multiple clients, use the interactive wizard to set up isolated environments.

```bash
npm run setup-company
```

The wizard will prompt you for:
- **Company ID**: A unique slug (e.g., `acme-corp`).
- **Display Name**: The human-readable name.
- **Persona Details**: Role and Tone (e.g., "Sr. DevOps Engineer", "Professional but friendly").

This creates the necessary directory structure in `.agent/companies/<id>/`.

---

## 3. SOP Creation Tutorial

Standard Operating Procedures (SOPs) are the brain of your agent. They define *how* tasks should be executed.

### Step 1: Create the SOP File
Create a markdown file in `.agent/companies/<company_id>/docs/sops/` (or global `sops/`).
**Example**: `deployment_sop.md`

### Step 2: Define the Protocol
Follow the standard format:

```markdown
# Production Deployment Protocol

## Purpose
To deploy updates to the production environment safely.

## Triggers
- "deploy to prod"
- "release version"

## Steps
1. **Pre-Flight Check**
   - Run `npm test` to ensure all tests pass.
   - Check `git status` for uncommitted changes.

2. **Build**
   - Run `docker build -t app:latest .`.

3. **Deploy**
   - Run `kubectl apply -f k8s/`.
   - Verify pods are running with `kubectl get pods`.

4. **Notify**
   - Post a message to Slack channel #releases.
```

### Step 3: Registration
The agent automatically indexes SOPs on startup. You can also force a refresh using the `refresh_sops` tool.

For advanced usage, see [SOP Engine Documentation](SOP_ENGINE.md).

---

## 4. Ghost Mode Configuration (24/7 Operations)

Ghost Mode allows the agent to run scheduled tasks autonomously.

### Configuration (`mcp.json`)
Add tasks to the `scheduledTasks` array in your `mcp.json` (or `.agent/config/mcp.json`):

```json
{
  "scheduledTasks": [
    {
      "id": "morning-standup",
      "name": "Morning Standup",
      "trigger": "cron",
      "schedule": "0 9 * * *",
      "prompt": "Check GitHub PRs and summarize them for the team in #general.",
      "company": "acme-corp",
      "yoloMode": true
    }
  ]
}
```

- **schedule**: Cron expression (e.g., `0 9 * * *` = Daily at 9 AM).
- **yoloMode**: If `true`, the agent executes without asking for permission.

---

## 5. HR Loop (Self-Improvement)

The HR Loop is a background process that critiques the agent's performance and proposes improvements.

### How it Works
1.  **Weekly Review**: Every Sunday, the agent analyzes its own logs.
2.  **Proposal**: It generates a "Performance Improvement Plan" (PIP) suggesting changes to Prompts, SOPs, or Tools.
3.  **Human Approval**: You review the proposal in `.agent/hr/proposals/` and approve/reject it.

### Enabling HR Loop
Ensure the **Health Monitor** sidecar is running (included in Docker/Helm setups).
You can also manually trigger a review:

```bash
# Using the CLI
simple "Perform a self-review of recent tasks" --tool hr.perform_weekly_review
```

See [HR Loop Documentation](HR_LOOP.md) for details.
