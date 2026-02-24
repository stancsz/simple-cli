# Business OS: Autonomous Operations

The "Business OS" initiative transforms Simple-CLI from a coding assistant into a comprehensive digital workforce capable of managing business operations.

## Architecture

The Business OS is built on a suite of specialized MCP servers:

1.  **Business Ops (`business_ops`)**: General operational tools.
2.  **Financial Ops (`financial_ops`)**: Financial management via Stripe and local ledger.
3.  **CRM (Planned)**: HubSpot/Salesforce integration.
4.  **Project Management (Planned)**: Linear/Jira integration.

## Financial Operations

The `financial_ops` server provides the following capabilities:

-   **Invoicing**: List and manage Stripe invoices (`list_invoices`).
-   **Customer Management**: Create and track customers (`create_customer`).
-   **Revenue Tracking**: Monitor Stripe balance (`get_balance`).
-   **Subscription Management**: Handle recurring revenue (`create_subscription`).
-   **Expense Tracking**: Record operational expenses in a local ledger (`create_expense`).

### Brain Integration

All financial transactions are automatically summarized using the LLM and recommended for logging into the Brain's episodic memory. This allows the agent to recall past expenses ("How much did we spend on servers last month?") and make informed decisions.

### Security

Financial secrets (e.g., `STRIPE_SECRET_KEY`) are managed via `.env.agent` and injected securely into the MCP server process. The server simulates OAuth token management practices to ensure long-term autonomy.

## Usage

To use financial tools, simply ask the agent:

> "Check our current Stripe balance."
> "Create a new customer for Acme Corp."
> "Record a $50 expense for cloud hosting."

The Orchestrator automatically routes these requests to the `financial_ops` server.
