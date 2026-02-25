# CRM Synchronization Playbook

This playbook defines the Standard Operating Procedure (SOP) for synchronizing agency operations with the CRM (HubSpot).

## Overview
The CRM Synchronization workflow ensures that client data and deal progress are accurately reflected in HubSpot. It handles:
1.  **Company Sync:** Creates or updates company records based on domain/name.
2.  **Contact Sync:** Creates or updates contact records based on email.
3.  **Deal Sync:** Tracks project milestones as deals in the sales pipeline.

## Prerequisites
- **HubSpot Integration:** The `business_ops` server must be configured with `HUBSPOT_ACCESS_TOKEN` in `.env.agent`.

## Core Tools

These tools are exposed via the `business_ops` MCP server and ensure **idempotency** (safe to retry).

### `sync_company_to_crm`
Syncs a company record.
- **Inputs:** `name`, `domain` (optional but recommended), `city`, `state`, etc.
- **Logic:** Searches by domain (primary) or name. Updates if found, creates if not.
- **Returns:** HubSpot Company ID and action (`created` or `updated`).

### `sync_contact_to_crm`
Syncs a contact record.
- **Inputs:** `email` (required), `firstname`, `lastname`, `company`, `phone`, `lifecyclestage`.
- **Logic:** Searches by email. Updates if found, creates if not.
- **Returns:** HubSpot Contact ID and action.

### `sync_deal_to_crm`
Syncs a deal record.
- **Inputs:** `dealname` (required), `amount`, `pipeline`, `dealstage`, `closedate`.
- **Logic:** Searches by deal name. Updates if found, creates if not.
- **Returns:** HubSpot Deal ID and action.

## Usage Scenarios

### 1. New Client Onboarding
When a new client is signed, the `client_onboarding_workflow` automatically calls:
1.  `sync_company_to_crm` to establish the account.
2.  `sync_contact_to_crm` to record the primary point of contact.

### 2. Deal Progression
As projects move through phases (e.g., "Proposal Sent", "Contract Signed"), agents should call `sync_deal_to_crm` to update the `dealstage` and probability in the pipeline.

### Example: Updating a Deal
```json
{
  "name": "sync_deal_to_crm",
  "arguments": {
    "dealname": "Website Redesign - Acme Corp",
    "dealstage": "contractsent",
    "amount": "15000"
  }
}
```

## Error Handling
- **Duplicate Prevention:** All tools implement "search-before-write" logic to prevent duplicates.
- **API Failures:** HubSpot API errors (e.g., invalid email format) are returned as tool errors.
