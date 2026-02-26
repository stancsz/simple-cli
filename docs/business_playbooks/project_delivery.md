# Business Playbook: Project Delivery Automation

**Purpose:** Automate the execution and reporting phase of the client lifecycle, ensuring transparency, consistency, and proactive issue resolution.

## Overview

This playbook describes how the Autonomous Agency manages active client projects using Linear, GitHub, and the Brain.

**Key Features:**
- **Automated Milestone Tracking:** Real-time visibility into project completion %.
- **Client Reporting:** Weekly Markdown reports generated from actual work (Linear) and context (Brain), committed to Git for version control.
- **Blocker Escalation:** Automatic detection and escalation of blocked tasks to ensure rapid resolution.

## Prerequisites

1.  **Linear Project Setup:**
    - Projects must be created in Linear.
    - Tasks should be linked to the project.
    - Status workflow must include "Completed", "In Progress", and "Blocked" states.
2.  **Environment Variables:**
    - `LINEAR_API_KEY`: For project access.
    - `GITHUB_TOKEN`: To fetch commit history.
    - `SLACK_WEBHOOK_URL`: To post reports and alerts.
3.  **Brain Integration:**
    - The agent must have `EpisodicMemory` enabled to log progress and context.

## Workflow Execution

### 1. Progress Tracking (Daily)
**Trigger:** Daily scheduled check or manual request.
**Tool:** `track_milestone_progress`

- **Input:** Project ID.
- **Outcome:**
  - Calculates completion percentage (e.g., "Sprint 1 is 45% complete").
  - Logs status to Company Context (Brain).

### 2. Client Reporting (Weekly)
**Trigger:** End of week (Friday).
**Tool:** `generate_client_report`

- **Input:** Project ID, Start Date, End Date.
- **Outcome:**
  - **Aggregates:**
    - Completed Tasks (Linear).
    - Blockers (Linear).
    - Recent Commits (GitHub).
    - Key Events (Brain Memory).
  - **Artifacts:**
    - Markdown Report saved to `reports/{project_id}/`.
    - Git Commit: `docs: client report for {project} ({date})`.
    - Slack Notification: Link to report and summary.

### 3. Issue Escalation (Real-time/Daily)
**Trigger:** Detection of "Blocked" status.
**Tool:** `escalate_blockers`

- **Input:** Project ID.
- **Outcome:**
  - Checks if issue is "Blocked".
  - If not already escalated:
    - Adds "Escalated" label.
    - Creates high-priority "Escalation" task.
    - Logs event to Brain.
    - Sends urgent Slack alert.

## Success Metrics

- **Report Consistency:** 100% of active projects have weekly reports.
- **Blocker Resolution Time:** Reduced by 50% due to automated escalation.
- **Client Transparency:** Clients receive data-driven updates based on actual commits and closed issues.
