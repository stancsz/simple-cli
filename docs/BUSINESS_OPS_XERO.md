# Xero Integration for Business Operations

This guide details the Xero integration within the Business Operations MCP server, enabling financial automation capabilities like invoicing and contact management.

## Prerequisites

- A Xero Developer account and App.
- `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET`.
- An authorized `XERO_ACCESS_TOKEN` and `XERO_REFRESH_TOKEN`.
- Optionally, `XERO_TENANT_ID`.

## Configuration

Add the following environment variables to your `.env.agent` file:

```env
XERO_CLIENT_ID=your_client_id
XERO_CLIENT_SECRET=your_client_secret
XERO_ACCESS_TOKEN=your_access_token
XERO_REFRESH_TOKEN=your_refresh_token
XERO_TENANT_ID=optional_tenant_id
```

If `XERO_TENANT_ID` is not provided, the integration will fetch the first connected tenant automatically.

The integration supports automatic token refreshing in-memory. If the `XERO_ACCESS_TOKEN` is expired, it uses `XERO_REFRESH_TOKEN` to obtain a new one for the session.

## Tools

### `xero_get_invoices`

Retrieves a list of invoices with optional filtering.

**Parameters:**
- `statuses`: (Optional) Array of status strings (e.g., `["AUTHORISED", "DRAFT"]`).
- `page`: (Optional) Page number (default: 1).
- `updatedAfter`: (Optional) ISO date string to filter by update date.
- `where`: (Optional) Xero filtering clause (e.g., `'Type=="ACCREC"'`).

**Example Usage:**
```json
{
  "name": "xero_get_invoices",
  "arguments": {
    "statuses": ["AUTHORISED"],
    "page": 1
  }
}
```

### `xero_create_invoice`

Creates a new invoice (Accounts Receivable).

**Parameters:**
- `contactId`: The Contact ID in Xero.
- `lineItems`: Array of line items.
  - `description`: String.
  - `quantity`: Number.
  - `unitAmount`: Number.
  - `accountCode`: (Optional) String.
- `date`: (Optional) Invoice date (YYYY-MM-DD).
- `dueDate`: (Optional) Due date (YYYY-MM-DD).
- `status`: (Optional) Status (default: "DRAFT").

**Example Usage:**
```json
{
  "name": "xero_create_invoice",
  "arguments": {
    "contactId": "c123...",
    "lineItems": [
      {
        "description": "Consulting Services",
        "quantity": 10,
        "unitAmount": 150.00
      }
    ],
    "status": "DRAFT"
  }
}
```

### `xero_get_contacts`

Retrieves contacts from Xero.

**Parameters:**
- `page`: (Optional) Page number (default: 1).
- `where`: (Optional) Filter clause (e.g., `'Name.Contains("ABC")'`).

**Example Usage:**
```json
{
  "name": "xero_get_contacts",
  "arguments": {
    "page": 1
  }
}
```
