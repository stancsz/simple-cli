# Project Delivery Automation Playbook

## Purpose
This playbook defines the automated procedures for managing client project delivery, ensuring consistent tracking, reporting, and issue resolution.

## Actors
- **Project Delivery Agent**: The autonomous agent executing the tools.
- **Linear**: Source of truth for task status.
- **GitHub**: Source of truth for code activity.
- **Brain (Episodic Memory)**: Storage for qualitative progress notes and history.
- **Slack**: Notification channel.

## Procedures

### 1. Milestone Tracking
**Goal:** Keep Linear up-to-date and maintain a narrative history in Brain.

- **Process:**
    1. Agent detects progress or receives a signal (e.g., from a developer agent).
    2. Agent calls `track_milestone_progress`.
    3. Tool updates Linear issue state.
    4. Tool logs the update to Brain with type `project_delivery`.

### 2. Client Reporting
**Goal:** Provide transparency to clients without manual overhead.

- **Process:**
    1. Determine reporting period (Weekly/Monthly).
    2. Agent calls `generate_client_report`.
    3. Tool fetches:
        - Completed issues from Linear.
        - In-progress tasks from Linear.
        - Blockers from Linear.
        - Key events from Brain memory.
        - Recent commits from GitHub (if repo URL provided or found).
    4. Tool formats data into a Markdown report.
    5. Report is saved to `reports/{project_id}/`.

### 3. Blocker Management
**Goal:** Proactively identify and resolve blockers.

- **Process:**
    1. Agent scans project regularly (e.g., daily).
    2. Agent calls `escalate_blockers`.
    3. Tool identifies issues with "Blocked" status.
    4. If not already escalated (checked via "Escalated" label):
        - Apply "Escalated" label to original issue.
        - Create a new "Escalation" issue in Linear.
        - Link to original issue.
        - Set priority to Urgent.
    5. Agent notifies the team via Slack (optional).

## Configuration
- **Environment Variables:**
    - `LINEAR_API_KEY`: Required for Linear API access.
    - `GITHUB_TOKEN`: Required for Git activity.
    - `SLACK_WEBHOOK_URL`: Optional for notifications.

## Metrics
- **Report Generation Frequency**: Weekly.
- **Escalation Resolution Time**: Tracked via Linear issue cycle time.
- **Milestone On-Time Delivery**: Tracked via Linear due dates vs. completion.
