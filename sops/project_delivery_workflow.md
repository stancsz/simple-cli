# Project Delivery Automation SOP

**Objective:** Automate milestone tracking, client reporting, and blocker escalation to ensure timely project delivery and transparent communication.

## Workflow Overview

1.  **Milestone Tracking**
    - **Trigger:** Milestone status change or progress update.
    - **Action:** Use `track_milestone_progress(project_id, milestone_name, status, notes)`.
    - **Outcome:** Linear issue updated, progress logged to Brain memory.

2.  **Weekly Status Reporting**
    - **Trigger:** Scheduled weekly (e.g., Friday 4 PM).
    - **Action:** Use `automate_status_update(project_id)`.
    - **Outcome:**
        - Generates a Markdown report in `reports/{project_id}/` including Linear progress and Git activity.
        - Notifies team via Slack (if configured).

3.  **Client Reporting**
    - **Trigger:** Ad-hoc request or end of sprint/month.
    - **Action:** Use `generate_client_report(project_id, period_start, period_end, github_repo_url?)`.
    - **Outcome:** comprehensive Markdown report aggregating completed items, in-progress work, blockers, key events, and recent commits.

4.  **Blocker Escalation**
    - **Trigger:** Daily check or specific event.
    - **Action:** Use `escalate_blockers(project_id)`.
    - **Outcome:**
        - Identifies blocked issues in Linear.
        - Applies "Escalated" label.
        - Creates a high-priority "Escalation" task.
        - Adds comments to original issue.

## Tools Usage

### `track_milestone_progress`
Updates a specific milestone (Linear issue) and logs the event to episodic memory.
```json
{
  "project_id": "proj_123",
  "milestone_name": "Phase 1 Delivery",
  "status": "In Progress",
  "notes": "Backend API complete, working on frontend integration."
}
```

### `generate_client_report`
Generates a detailed report for a specific time range.
```json
{
  "project_id": "proj_123",
  "period_start": "2023-10-01",
  "period_end": "2023-10-07",
  "github_repo_url": "https://github.com/owner/repo"
}
```

### `automate_status_update`
Wrapper for weekly reporting and notification.
```json
{
  "project_id": "proj_123"
}
```

### `escalate_blockers`
Scans for issues with "Blocked" status and escalates them.
```json
{
  "project_id": "proj_123"
}
```

## Maintenance
- Ensure `LINEAR_API_KEY`, `GITHUB_TOKEN` and `SLACK_WEBHOOK_URL` are set in `.env.agent`.
- Periodically review `reports/` folder for generated artifacts.
