# Standard Operating Procedure: Project Delivery Automation

**Objective:** Automate the tracking, reporting, and escalation of client project deliverables to ensure transparency and proactive issue resolution.
**Scope:** Active client projects managed in Linear.
**Trigger:**
- Weekly Schedule (Reporting).
- Manual Request (Progress Check).
- Blocker Detection (Escalation).

## Workflow Steps

### 1. Milestone Progress Tracking
**Tool:** `track_milestone_progress`
**Frequency:** Daily or On-Demand.

1.  **Identify Project:** Determine the `project_id` from the request or active project list.
2.  **Determine Milestone:** (Optional) Identify specific milestone name (e.g., "Sprint 1").
3.  **Execute Tool:** Call `track_milestone_progress(project_id, milestone_name)`.
4.  **Review Output:** Check completion percentage and total issues.
5.  **Action:** If progress is stalled (< 10% progress in 3 days), consider triggering `escalate_blockers`.

### 2. Client Reporting
**Tool:** `generate_client_report`
**Frequency:** Weekly (e.g., Friday PM).

1.  **Define Period:** Set `period_start` and `period_end` (typically last 7 days).
2.  **Execute Tool:** Call `generate_client_report(project_id, period_start, period_end)`.
    - *Note:* Ensure `GITHUB_TOKEN` and `SLACK_WEBHOOK_URL` are set for full functionality.
3.  **Verify Artifacts:**
    - Report saved to `reports/{project_id}/`.
    - Git commit created.
    - Slack notification sent.

### 3. Blocker Escalation
**Tool:** `escalate_blockers`
**Frequency:** Continuous / Daily.

1.  **Scan Project:** Call `escalate_blockers(project_id)`.
2.  **Analyze Output:**
    - If `escalated_issues` is not empty, verify that escalation tasks were created in Linear.
    - Verify Slack alert was sent.
3.  **Follow Up:**
    - If blockers persist > 48h, escalate to human operator manually.

## Troubleshooting

- **"Git commit skipped":** Ensure the agent is running within a Git repository and has `git` installed.
- **"Slack notification failed":** Check `SLACK_WEBHOOK_URL` environment variable.
- **"Brain memory retrieval unavailable":** Ensure `EpisodicMemory` is initialized and `LanceDB` is accessible.
