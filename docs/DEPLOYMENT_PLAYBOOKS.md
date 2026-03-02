# Deployment Playbooks: Business Operations

This document outlines standard deployment scenarios for validating Business MCP Server integrations (Xero, HubSpot, Linear).

## Scenario 1: Startup MVP (The "Lean Launch")

**Objective:** Validate core financial, CRM, and project management flows for a new startup.

**Workflow:**
1.  **Financial Initialization (Xero):**
    *   Create an invoice for a new client.
    *   Verify the invoice is in `DRAFT` status.
2.  **Lead Capture (HubSpot):**
    *   Create a contact corresponding to the client on the invoice.
    *   Verify contact properties (email, company).
3.  **Task Creation (Linear):**
    *   Create a task in Linear to "Onboard Client [Name]".
    *   Link the task description to the invoice ID for traceability.

**Tools Used:**
*   `xero_create_invoice`
*   `create_contact`
*   `linear_create_issue`

**Success Criteria:**
*   Invoice created with correct line items.
*   Contact exists in HubSpot with matching email.
*   Linear issue created in the correct team with a reference to the invoice.

---

## Scenario 2: Enterprise Migration (The "Big Shift")

**Objective:** Validate high-volume data handling and synchronization during a legacy system migration.

**Workflow:**
1.  **Batch Financials (Xero):**
    *   Simulate batch creation of historical invoices (loop `xero_create_invoice`).
    *   Verify system handles multiple sequential requests without rate limiting errors (mocked).
2.  **Contact Sync (HubSpot):**
    *   Search for existing contacts (`search_contacts`).
    *   Update contact properties based on migration data (`update_contact`).
3.  **Project Migration (Linear):**
    *   List existing issues (`linear_list_issues`) to check current state.
    *   Update issue status (`linear_update_issue`) to reflect migration progress (e.g., move to "In Progress").

**Tools Used:**
*   `xero_create_invoice` (looped)
*   `search_contacts`
*   `update_contact`
*   `linear_list_issues`
*   `linear_update_issue`

**Success Criteria:**
*   Multiple invoices created successfully.
*   Contacts updated with new migration flags/data.
*   Linear issues transitioned correctly reflecting the migration state.

---

## Scenario 3: Agency Consulting (The "Client Retainer")

**Objective:** Validate ongoing operational workflows for an agency managing multiple clients.

**Workflow:**
1.  **Financial Health Check (Xero):**
    *   Retrieve Profit & Loss report (`get_profit_and_loss`) to assess client profitability.
    *   (Optional) Check Balance Sheet (`get_balance_sheet`).
2.  **Deal Pipeline Management (HubSpot):**
    *   Create a new deal for a retainer renewal (`create_deal`).
    *   Associate deal with the client company.
3.  **Sprint Planning (Linear):**
    *   List issues for the client's project (`linear_list_issues`).
    *   (Optional) Create a new sprint-planning issue (`linear_create_issue`).

**Tools Used:**
*   `get_profit_and_loss`
*   `create_deal`
*   `linear_list_issues`

**Success Criteria:**
*   P&L report retrieved successfully.
*   Deal created in the correct pipeline stage.
*   Project issues listed and accessible for planning.

---

## Scenario 4: Routine Strategic Scans (Cost Savings)

**Objective:** Validate token and cost reductions using Batch Prompt Consolidation (Phase 28).

**Workflow:**
1.  **Multiple Scans Triggered:**
    *   `strategic_scan`, `performance_metrics`, and `market_analysis` are scheduled concurrently.
2.  **Batch Execution:**
    *   The `BatchExecutor` intercepts and consolidates them into a single context window.
    *   The LLM processes all three tasks and returns a combined JSON response.
3.  **Metrics Verified:**
    *   Dashboard reflects an increase in `batched_calls_count` and significant `tokens_saved_via_batching`.

**Performance Impact:**
*   **Without Batching:** 3 API calls, 3x system prompt tokens, 3x context overhead.
*   **With Batching:** 1 API call, 1x system prompt tokens, independent task processing. Typical token savings: **40-60%**.
