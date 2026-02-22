# Automated Company Onboarding SOP

The Automated Company Onboarding SOP simplifies the process of setting up a new company environment within the Simple CLI framework. By executing a single command, you can activate all 6 Pillars of the agency: Company Context, Brain, SOP Engine, Ghost Mode, HR Loop, and Health Monitor.

## Quick Start

To onboard a new company, run:

```bash
simple onboard-company <company-name>
```

For example:
```bash
simple onboard-company acme-corp
```

## What Happens

The `onboard-company` command triggers the `onboarding_new_company.md` SOP, which executes the following steps autonomously:

1.  **Initialize Company Context**: Creates the directory structure (`.agent/companies/<name>/`) and generates the initial `company_context.json`.
2.  **Initialize Brain**: Seeds the episodic memory vector database for the company.
3.  **Create Sample SOP**: Generates a `hello_world.md` SOP to verify the SOP Engine is functioning.
4.  **Schedule Ghost Mode**: Configures the **Job Delegator** and **Reviewer** agents to run hourly via the Scheduler.
5.  **Enable HR Loop**: Schedules the **Daily HR Review** to analyze logs and propose improvements.
6.  **Validate Onboarding**: Performs a comprehensive system check of all pillars and generates a status report.

## Verification

After the process completes, a report is saved to:
`.agent/companies/<company-name>/onboarding_report.md`

You can verify the setup by checking this report or by switching to the company context and running a command:

```bash
simple switch <company-name>
simple sop execute hello_world
```
