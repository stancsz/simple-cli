# Client Offboarding Playbook

**Status:** Active
**Phase:** 22 (Autonomous Client Lifecycle)

## Use Case
This playbook outlines the steps for securely offboarding a client. It ensures legal, financial, and operational closure of the engagement.

## Configuration
The `execute_client_offboarding` tool requires the following environment variables:
- `HUBSPOT_ACCESS_TOKEN`: For CRM updates.
- `LINEAR_API_KEY`: For project archival.
- `XERO_ACCESS_TOKEN`: For financial account archival.
- `GITHUB_TOKEN` (optional): For fetching repository stats.

## Manual Triggers
While the system is designed to trigger offboarding automatically upon final milestone completion, manual execution may be necessary for:
- Early contract termination.
- Legacy project cleanup.

**Command:**
```bash
mcp_tool execute_client_offboarding company_id="ClientName" deal_id="12345" confirm_financial_closure=true
```

## Expected Outcomes
1.  **CRM:** Deal stage updated to `closedwon`.
2.  **Linear:** Project state updated to `completed`.
3.  **Xero:** Contact status updated to `ARCHIVED`.
4.  **Git:** Handover report committed and repository tagged.
5.  **Brain:** Offboarding event stored.
