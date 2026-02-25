# Lead Generation Workflow

**Status:** Proposed
**Owner:** Business Operations
**Last Updated:** February 2026

## Objective
To autonomously discover, qualify, and initiate outreach to potential clients using the Business Operations MCP.

## Prerequisites
- `GITHUB_TOKEN` environment variable set (for GitHub discovery).
- `HUBSPOT_ACCESS_TOKEN` environment variable set.
- Brain (Episodic Memory) initialized.

## Workflow Steps

### 1. Discovery
Use the `discover_leads` tool to find potential leads matching specific criteria.

**Example:**
```json
{
  "target_audience": "Startups using React",
  "criteria": {
    "source": "github",
    "keywords": ["react", "startup"],
    "min_followers": 50
  }
}
```

### 2. Qualification
Analyze each lead using the `qualify_lead` tool. This step stores the lead profile in the Brain's Company Context.

**Example:**
```json
{
  "company_url": "https://github.com/someuser",
  "contact_email": "user@example.com"
}
```
**Output:** A qualification score and boolean status.

### 3. Outreach
For qualified leads (e.g., score > 50), initiate outreach using `initiate_outreach`.

**Example:**
```json
{
  "lead_id": "user@example.com",
  "template_name": "intro_react_services",
  "custom_message": "I saw your recent contribution to..."
}
```
**Action:**
- Syncs contact to HubSpot.
- Logs a note in HubSpot with the outreach message.

### 4. Review
Periodically review the Brain's "lead_profile" memories to adjust qualification criteria or outreach templates.
