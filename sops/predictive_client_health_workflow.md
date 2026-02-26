# Predictive Client Health Workflow

**Status:** Active
**Owner:** Business Operations
**Last Updated:** February 2026

## Objective
To proactively identify client retention risks and trigger automated interventions before issues escalate, using a combination of Linear metrics, CRM sentiment, and Brain memories.

## Workflow Overview

The workflow consists of three autonomous steps:
1.  **Analyze**: Aggregate multi-modal data into a `HealthReport`.
2.  **Predict**: Calculate a `riskScore` and identify key risk factors.
3.  **Intervene**: Execute pre-defined protocols for high-risk clients.

## Detailed Steps

### 1. Analyze Client Health
Use `analyze_client_health` to gather data.

**Inputs:**
- `clientId`: Unique identifier (e.g., "Acme Corp").
- `linearProjectId`: ID of the main project in Linear.
- `contactEmail`: Primary contact email for HubSpot sentiment analysis.

**Data Sources:**
- **Linear**: Velocity (completed issues in last 14 days), Open Issues, Blockers, Resolution Time.
- **HubSpot**: Recent interaction frequency (days since last contact), Note sentiment.
- **Brain**: Semantic search for negative feedback or recurring issues.

### 2. Predict Retention Risk
Use `predict_retention_risk` to process the `HealthReport`.

**Risk Scoring Logic (0-100):**
- **Base Score**: 0 (Healthy).
- **Stalled Velocity**: +30 points (0 velocity with open issues).
- **Blockers**: +25 points (> 2 blockers).
- **Low Engagement**: +15 points (> 14 days silence).
- **Negative History**: +20 points (Brain sentiment analysis).

**Risk Levels:**
- **Low (0-30)**: Normal monitoring.
- **Medium (31-50)**: Watchlist.
- **High (51-70)**: Active Management.
- **Critical (71-100)**: Immediate Intervention.

### 3. Preemptive Intervention
Use `trigger_preemptive_intervention` for clients with Risk Score > 70.

**Intervention Protocol:**
1.  **Linear Escalation**: Automatically create a "High Priority" issue:
    -   Title: `RISK INTERVENTION: {Client Name}`
    -   Description: Includes risk score and factors.
2.  **CRM Alert**: Log a task/note in HubSpot:
    -   Body: `URGENT: Client Risk Intervention Triggered. Score: {Score}. Reason: {Reason}`.
3.  **Memory Log**: Store the intervention event in the Brain for future pattern matching.

## Usage Example

```typescript
// 1. Analyze
const report = await callTool("analyze_client_health", {
  clientId: "Acme Corp",
  linearProjectId: "proj_123",
  contactEmail: "contact@acme.com"
});

// 2. Predict
const prediction = await callTool("predict_retention_risk", {
  healthReport: report.content[0].text
});

// 3. Intervene (if needed)
if (JSON.parse(prediction.content[0].text).riskScore > 70) {
  await callTool("trigger_preemptive_intervention", {
    clientId: "Acme Corp",
    riskScore: 85,
    reason: "Stalled Velocity, Multiple Blockers",
    linearProjectId: "proj_123",
    contactEmail: "contact@acme.com"
  });
}
```
