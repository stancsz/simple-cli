# CRM Integration (HubSpot)

This document details the integration of HubSpot CRM as an MCP server within the Business OS.

## Overview
The CRM MCP server provides a standardized interface for managing contacts, companies, and deals directly from the Simple-CLI agent. It uses the HubSpot API to perform CRUD operations and search.

## Prerequisites
- A HubSpot Developer Account or Portal.
- A Private App with the following scopes:
  - `crm.objects.contacts.read`
  - `crm.objects.contacts.write`
  - `crm.objects.companies.read`
  - `crm.objects.deals.read`
  - `crm.objects.deals.write`
  - `crm.schemas.contacts.read` (optional)

## Configuration
The server requires a HubSpot Access Token, which should be set as an environment variable or stored in the Secret Manager.

**Environment Variable:**
`HUBSPOT_ACCESS_TOKEN=your_private_app_access_token`

## Available Tools

### `create_contact`
Create a new contact in HubSpot.
- **Args:** `email` (required), `firstname`, `lastname`, `company`, `phone`, `website`, `lifecyclestage`

### `update_contact`
Update an existing contact.
- **Args:** `id` (required), `properties` (JSON string)

### `search_contacts`
Search for contacts by email, name, or company.
- **Args:** `query` (required), `limit` (default: 10)

### `create_deal`
Create a new deal pipeline.
- **Args:** `dealname` (required), `amount`, `pipeline`, `dealstage`, `closedate`

### `update_deal`
Update a deal's properties or stage.
- **Args:** `id` (required), `properties` (JSON string)

### `search_companies`
Search for companies by name or domain.
- **Args:** `query` (required), `limit` (default: 10)

### `sync_status`
Check connectivity with HubSpot.

## Usage in SOPs
You can reference these tools in your SOP markdown files.

```markdown
## Step 1: Create Lead
Call `create_contact` with:
- email: "client@example.com"
- firstname: "John"
- lastname: "Doe"

## Step 2: Create Deal
Call `create_deal` with:
- dealname: "New Project for John Doe"
- amount: "5000"
```

## Troubleshooting
- **Authentication Error:** Ensure `HUBSPOT_ACCESS_TOKEN` is correct and has the necessary scopes.
- **Rate Limiting:** The server uses the official client which handles basic retries, but heavy usage might trigger 429 errors.
- **Property Errors:** Ensure property names (e.g., `lifecyclestage`) match HubSpot's internal names exactly.
