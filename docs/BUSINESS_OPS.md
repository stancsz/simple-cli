# Business Operations MCP Server

## Vision
The **Business Operations MCP Server** (`business_ops`) is the foundation for Phase 19: Autonomous Business Operations. It marks the transition of Simple-CLI from a purely technical assistant to a comprehensive "Business OS" capable of managing financial, operational, and strategic workflows.

The goal is to enable the agent to:
1.  **Monitor Financial Health:** Track revenue, expenses, and burn rate via integrations with accounting platforms (e.g., Xero, QuickBooks).
2.  **Manage Relationships:** Automate CRM updates (e.g., HubSpot, Salesforce) based on email interactions or project milestones.
3.  **Oversee Projects:** Synchronize technical progress with project management tools (e.g., Linear, Jira) to keep stakeholders informed.

## Architecture
The server follows the standard MCP architecture:
- **Tools:** Abstract business actions into standardized tool calls.
- **Mock Data:** Initially powered by mock data for architectural validation.
- **Future Integrations:** Designed to swap mock implementations with real API clients (e.g., using official SDKs) without changing the tool interface.

## Configuration

To use the Xero integration, you must configure the following environment variables in your `.env.agent` file:

```bash
XERO_ACCESS_TOKEN=your_xero_access_token
XERO_TENANT_ID=your_xero_tenant_id # Optional: If not provided, the first connected tenant will be used.
LINEAR_API_KEY=lin_api_your_key_here
```

## Tools

### Financial Tools (Xero Integration)

#### `list_invoices`
List invoices from Xero.
- **Inputs:**
  - `statuses`: Array of statuses (e.g., `["AUTHORISED", "DRAFT"]`) (optional)
  - `page`: Page number (default: 1) (optional)
  - `updatedAfter`: Filter by updated date (ISO string) (optional)
  - `where`: Filter by where clause (e.g., `'Type=="ACCREC"'`) (optional)
- **Output:** List of invoices.

#### `create_invoice`
Create a new invoice in Xero.
- **Inputs:**
  - `contactId`: The Contact ID.
  - `lineItems`: Array of objects with `description`, `quantity`, `unitAmount`, `accountCode`.
  - `date`: Invoice date (YYYY-MM-DD) (optional).
  - `dueDate`: Due date (YYYY-MM-DD) (optional).
  - `status`: Invoice status (`DRAFT`, `SUBMITTED`, `AUTHORISED`) (default: `DRAFT`).
- **Output:** The created invoice.

#### `get_balance_sheet`
Get the Balance Sheet report.
- **Inputs:**
  - `date`: Report date (YYYY-MM-DD) (optional).
- **Output:** Balance Sheet report data.

#### `get_profit_and_loss`
Get the Profit and Loss report.
- **Inputs:**
  - `fromDate`: Start date (YYYY-MM-DD).
  - `toDate`: End date (YYYY-MM-DD).
- **Output:** Profit and Loss report data.

### Project Management Tools (Linear Integration)

#### `linear_list_issues`
List issues from Linear with optional filtering.
- **Inputs:**
  - `first`: Number of issues to return (default: 50).
  - `teamId`: Filter by Team ID (optional).
  - `state`: Filter by state name (e.g., 'In Progress') (optional).
- **Output:** List of issues (ID, Title, State, Team, Assignee).

#### `linear_create_issue`
Create a new issue in Linear.
- **Inputs:**
  - `title`: Issue title.
  - `teamId`: Team ID to create the issue in.
  - `description`: Issue description (markdown supported) (optional).
  - `priority`: Priority (0-4) (optional).
  - `stateId`: State ID (optional).
- **Output:** The created issue (ID, Identifier, Title, URL).

#### `linear_update_issue`
Update an existing issue in Linear.
- **Inputs:**
  - `id`: The Issue ID.
  - `title`: New title (optional).
  - `description`: New description (optional).
  - `stateId`: New State ID (optional).
  - `priority`: New priority (optional).
  - `assigneeId`: New Assignee User ID (optional).
- **Output:** The updated issue.

### CRM & Project Tools (Mock Implementation)

#### `query_financials`
Retrieves financial performance data for a specified period (Mock).
- **Inputs:** `period` (current_month, last_month, ytd, last_year), `department` (optional)
- **Output:** JSON object containing revenue, expenses, profit, and currency.

#### `create_crm_contact`
Adds a new lead or contact to the CRM.
- **Inputs:** `name`, `email`, `company` (optional), `status` (lead, prospect, customer)
- **Output:** Confirmation message with the new contact ID.

#### `update_project_status`
Updates the status of a task or ticket in the project management system.
- **Inputs:** `ticket_id`, `status` (todo, in_progress, review, done), `comment` (optional)
- **Output:** Confirmation message.

## Integration Plan
1.  **Phase 1 (Current):** Mock implementation to validate the MCP interface and agent reasoning.
2.  **Phase 2:** Integrate with public APIs (e.g., JSONPlaceholder) or sandbox environments of real services.
3.  **Phase 3:** Implement secure OAuth flow and secret management for production credentials.
    - **Status:** Xero integration implemented using `XERO_ACCESS_TOKEN`.
4.  **Phase 4:** Enable autonomous "Business Logic" loops via the Brain and Scheduler (e.g., monthly financial reporting).
