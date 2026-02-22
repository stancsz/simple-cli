# Simple CLI: Showcase Corp Demo

Welcome to the **Showcase Corp Demo**. This repository demonstrates the **"Digital Agency"** capability of Simple CLI, where an autonomous AI workforce builds, deploys, and manages software for a client.

## 🌟 The Scenario

You are the owner of "Showcase Corp", a new startup needing a TODO app. You have hired Simple CLI as your digital engineering team.

The demo simulates a 24-hour cycle in just a few minutes:
1.  **Onboarding**: The agent ingests your Company Context (brand, tech stack, goals).
2.  **SOP Execution**: The agent follows a strict "Project Initialization" SOP to scaffold the app.
3.  **Ghost Mode**: The agent works overnight, performing a "Morning Standup" at 9:00 AM.
4.  **HR Loop**: The agent reflects on its work at 6:00 PM and proposes self-improvements.

## 🚀 Quickstart

### Option 1: Fast Simulation (Recommended)
Run the self-contained simulation script to see the 4 pillars in action immediately.

```bash
# From the root of the repository
npm run demo
```

**What you will see:**
-   Logs showing the agent connecting to "The Brain".
-   Loading of `company_context.json`.
-   Execution of the `showcase_sop.md`.
-   Simulated "Morning Standup" and "HR Review" tasks.

### Option 2: CLI Installation (Interactive Mode)
Install "Showcase Corp" into your main CLI environment to interact with it manually using the `simple` command.

```bash
# Setup the company context
npx tsx scripts/setup-showcase.ts

# Switch to the context
simple company switch showcase-corp

# Interact with the agent
simple chat "What is the tech stack?"
```

### Option 3: Production Deployment (Docker)
Deploy the agent as a background daemon (Ghost Mode) that runs 24/7.

```bash
# From this directory
docker compose -f docker-compose.prod.yml up -d --build
```

**Verify it's running:**
```bash
docker compose -f docker-compose.prod.yml logs -f
```

**Note**: The daemon will wait for scheduled tasks (9:00 AM / 6:00 PM). To see immediate action, use Option 1.

## 📂 Artifacts

-   `company_context.json`: The "Briefcase" defining Showcase Corp.
-   `docs/sops/showcase_sop.md`: The Standard Operating Procedure used by the agent.
-   `.agent/`: The persistent memory (Brain, Logs, Context) created during the demo.

## 🧪 Validation

This demo is validated by `tests/integration/showcase_simulation.test.ts`.
Run the test:
```bash
npm test tests/integration/showcase_simulation.test.ts
```
