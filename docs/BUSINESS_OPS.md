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

## Tools

### `query_financials`
Retrieves financial performance data for a specified period.
- **Inputs:** `period` (current_month, last_month, ytd, last_year), `department` (optional)
- **Output:** JSON object containing revenue, expenses, profit, and currency.

### `create_crm_contact`
Adds a new lead or contact to the CRM.
- **Inputs:** `name`, `email`, `company` (optional), `status` (lead, prospect, customer)
- **Output:** Confirmation message with the new contact ID.

### `update_project_status`
Updates the status of a task or ticket in the project management system.
- **Inputs:** `ticket_id`, `status` (todo, in_progress, review, done), `comment` (optional)
- **Output:** Confirmation message.

## Integration Plan
1.  **Phase 1 (Current):** Mock implementation to validate the MCP interface and agent reasoning.
2.  **Phase 2:** Integrate with public APIs (e.g., JSONPlaceholder) or sandbox environments of real services.
3.  **Phase 3:** Implement secure OAuth flow and secret management for production credentials.
4.  **Phase 4:** Enable autonomous "Business Logic" loops via the Brain and Scheduler (e.g., monthly financial reporting).
