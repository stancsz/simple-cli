# Client Offboarding Workflow

**Objective:** Securely archive client projects, perform a final handover, and clean up resources to complete the client lifecycle (Phase 22).

**Last Updated:** 2024-05-24

## 1. Overview
The client offboarding process ensures that all client data is securely archived, financial accounts are settled, and a professional handover is provided. This process is primarily automated via the `execute_client_offboarding` tool.

## 2. Triggers
- **Milestone Completion:** All project milestones in Linear are marked as Completed.
- **Contract Expiry:** Service agreement term has ended.
- **Client Request:** Formal request for project closure.

## 3. Prerequisites
- **Linear:** All active tasks should be resolved or cancelled.
- **Billing:** Final invoice should be generated and sent (optional but recommended).
- **Git:** All code changes must be committed.

## 4. Automated Workflow
The `execute_client_offboarding` tool orchestrates the following steps:

1.  **CRM Update (HubSpot):**
    - Updates the associated Deal stage to 'Closed/Won'.
    - Adds an offboarding note to the Deal and Company record.

2.  **Project Archival (Linear):**
    - Sets the Linear Project state to 'Completed'.
    - (Optional) Adds an 'Archived' label to the project or key issues.

3.  **Knowledge Archival (Brain):**
    - Stores an `offboarding_event` memory in the Brain, marking the context as `status: archived`.

4.  **Financial Closure (Xero):**
    - (Optional) Marks the Contact as `ARCHIVED` in Xero to prevent future invoicing errors.

5.  **Asset Handover (Git):**
    - Generates a `HANDOVER_<date>.md` report summarizing the engagement.
    - Commits the report to the repository.
    - Tags the repository with `offboard-<company>-<date>`.

## 5. Manual Execution
To trigger the workflow manually using the `business_ops` MCP:

```json
{
  "name": "execute_client_offboarding",
  "arguments": {
    "company_id": "Acme Corp",
    "deal_id": "1234567890",
    "confirm_financial_closure": true
  }
}
```

## 6. Data Retention Policy
- **Code:** Git repositories are tagged and retained indefinitely (cold storage).
- **Documents:** Handover reports are stored in `reports/` and versioned in Git.
- **Brain:** Memories are marked as archived but retained for future reference (e.g., "Pattern Recall").
- **Financials:** Invoices and transaction history are retained in Xero for compliance (7+ years).

## 7. Troubleshooting
- **Git Error:** Ensure the tool is running in a valid Git repository root.
- **CRM Not Found:** Verify the `deal_id` matches a valid HubSpot Deal ID.
- **Linear Project Not Found:** Ensure the Linear project description contains the Deal ID or the name matches the Company ID.
