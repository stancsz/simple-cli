# Automated Billing Playbook

This playbook defines the Standard Operating Procedure (SOP) for automated client billing using the Business Operations MCP server and Xero integration.

## Overview
The Automated Billing workflow streamlines the financial lifecycle of a client project. It handles:
1.  **Contact Resolution:** Automatically finds or creates the client in Xero.
2.  **Invoice Generation:** Creates professional invoices with detailed line items.
3.  **Delivery:** Emails the invoice to the primary contact immediately (optional).
4.  **Audit:** Logs all billing actions to the company's context for historical tracking.

## Prerequisites
- **Xero Integration:** The `business_ops` server must be configured with valid Xero credentials in `.env.agent`.
- **Client Information:** Client name and email are required to resolve the contact.

## Workflow: `automated_billing_workflow`

This is the primary entry point for the agent.

### Input Parameters
| Parameter | Type | Description |
| :--- | :--- | :--- |
| `clientName` | String | Name of the client company. |
| `contactEmail` | String | Primary contact email. |
| `items` | Array | List of line items (description, quantity, unitAmount). |
| `dueDate` | String | Payment due date (YYYY-MM-DD). |
| `sendEmail` | Boolean | If `true`, emails the invoice immediately (default: `true`). |

### Example Usage

```json
{
  "name": "automated_billing_workflow",
  "arguments": {
    "clientName": "Acme Corp",
    "contactEmail": "billing@acmecorp.com",
    "dueDate": "2025-02-28",
    "sendEmail": true,
    "items": [
      {
        "description": "Monthly Retainer - February 2025",
        "quantity": 1,
        "unitAmount": 5000
      },
      {
        "description": "Additional Support Hours",
        "quantity": 5,
        "unitAmount": 150
      }
    ]
  }
}
```

## Core Tools

The workflow orchestrates the following atomic tools, which can also be called individually for ad-hoc tasks.

### `billing_create_invoice`
Creates a draft or authorised invoice.
- **Inputs:** `contactId`, `lineItems`, `dueDate`.

### `billing_send_invoice`
Emails an existing invoice to the contact.
- **Inputs:** `invoiceId`.

### `billing_record_payment`
Records a payment against an invoice (e.g., bank transfer received).
- **Inputs:** `invoiceId`, `amount`, `accountId`, `date`.

### `billing_get_payment_status`
Checks if an invoice is PAID, AUTHORISED, or OVERDUE.
- **Inputs:** `invoiceId`.

## Error Handling
- **Contact Not Found:** The workflow attempts to create a new contact if one is not found by email.
- **API Failures:** Xero API errors (e.g., validation) are caught and returned in the `errors` array of the response.
- **Audit Failure:** If writing to the audit log fails, the workflow completes but warns in the logs.
