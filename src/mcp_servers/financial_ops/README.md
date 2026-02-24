# Financial Operations MCP Server

This server provides financial management capabilities using the Stripe API and a local ledger for expense tracking. It is part of the "Business OS" initiative.

## Setup

1.  **Stripe API Key**: Obtain a Stripe Secret Key (starts with `sk_`).
2.  **Environment Variable**: Add the key to your `.env.agent` file:
    ```bash
    STRIPE_SECRET_KEY=sk_test_...
    ```

3.  **Run**: The server is automatically started by the Orchestrator via `mcp.json`.

## Tools

-   `list_invoices`: List invoices from Stripe.
-   `create_customer`: Create a new customer in Stripe.
-   `get_balance`: Retrieve current Stripe balance.
-   `create_subscription`: Create a subscription for a customer.
-   `create_expense`: Record an expense in the local ledger (`.agent/financial_ops/ledger.json`). This tool also generates an episodic memory summary using the LLM.

## Logging & Brain Integration

Transactions are logged locally to `.agent/financial_ops/ledger.json`. The tools return a summary that prompts the Agent to sync important events to the Brain using `log_experience`.

## OAuth Notes

Stripe Standard integration uses API Keys which are long-lived. The server includes logic to check for key presence but does not perform OAuth refresh as it is not required for this provider. If you switch to Stripe Connect or Xero, update `refreshOAuthToken` in `index.ts`.
