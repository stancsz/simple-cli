# Lead Generation Playbook

**Objective:** Automatically discover, qualify, and engage potential clients using the Business Operations MCP.

## Overview
This playbook defines how the agency autonomously generates leads. It leverages GitHub for discovery, a heuristic engine for qualification, and HubSpot for relationship management.

## Tools Used
- `discover_leads`: Finds potential leads from public sources.
- `qualify_lead`: Scores leads and stores profiles in the Brain.
- `initiate_outreach`: Sends emails and logs activity in HubSpot.

## Workflow

### 1. Configure Environment
Ensure the following variables are set in `.env.agent`:
- `GITHUB_TOKEN`: For searching users on GitHub.
- `HUBSPOT_ACCESS_TOKEN`: For CRM integration.

### 2. Run Discovery
The agent uses `discover_leads` to find targets.
```typescript
use_mcp_tool("business_ops", "discover_leads", {
  target_audience: "Fintech Startups",
  criteria: {
    source: "github",
    keywords: ["fintech", "blockchain"]
  }
});
```

### 3. Qualify Leads
The agent analyzes discovered leads. High-scoring leads are stored in the Brain.
```typescript
use_mcp_tool("business_ops", "qualify_lead", {
  company_url: "https://github.com/fintech-startup",
  contact_email: "contact@startup.com"
});
```

### 4. Initiate Outreach
The agent sends an initial outreach to qualified leads.
```typescript
use_mcp_tool("business_ops", "initiate_outreach", {
  lead_id: "contact@startup.com",
  template_name: "intro_fintech"
});
```
*Note: This logs a Note in HubSpot attached to the Contact record.*

## Metrics
- **Leads Discovered**: Count of leads found per week.
- **Qualification Rate**: Percentage of leads with score > 50.
- **Outreach Success**: Number of responses (tracked manually or via future email hook).
