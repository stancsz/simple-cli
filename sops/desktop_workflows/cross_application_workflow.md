# Cross-Application Workflow SOP

This SOP demonstrates how to orchestrate a workflow across multiple web applications using the Desktop Orchestrator.

## Scenario
Retrieve a customer's email from a CRM dashboard and then navigate to an invoicing tool to create a draft invoice for them.

## Prerequisites
- Desktop Orchestrator MCP server running.
- Mock CRM URL: `https://mock-crm.com/dashboard`
- Mock Invoicing URL: `https://mock-invoice.com/new`

## Workflow

1.  **Access CRM Dashboard**
    - **Action**: Use `navigate_to` tool.
    - **Params**:
        - `url`: "https://mock-crm.com/dashboard"
        - `task_description`: "Navigate to CRM dashboard."
    - **Verification**: `verify_desktop_action` -> `type: 'url_contains', value: 'dashboard'`.

2.  **Search for Customer**
    - **Action**: Use `type_text` tool.
    - **Params**:
        - `selector`: "input[name='search']"
        - `text`: "Acme Corp"
        - `task_description`: "Search for Acme Corp in CRM."
    - **Action**: Use `click_element` tool.
    - **Params**:
        - `selector`: "button.search-btn"
    - **Verification**: `verify_desktop_action` -> `type: 'text_present', value: 'Acme Corp'`.

3.  **Extract Contact Email**
    - **Action**: Use `extract_page_text` tool.
    - **Params**:
        - `task_description`: "Extract text to find the email address."
    - **Process**: The calling agent parses the text to find the email (e.g., `contact@acmecorp.com`).

4.  **Navigate to Invoicing Tool**
    - **Action**: Use `navigate_to` tool.
    - **Params**:
        - `url`: "https://mock-invoice.com/new"
        - `task_description`: "Navigate to new invoice page."
    - **Verification**: `verify_desktop_action` -> `type: 'url_contains', value: 'new'`.

5.  **Create Invoice Draft**
    - **Action**: Use `type_text` tool.
    - **Params**:
        - `selector`: "input[name='customer_email']"
        - `text`: "contact@acmecorp.com" (Extracted from Step 3)
        - `task_description`: "Enter customer email for invoice."
    - **Action**: Use `click_element` tool.
    - **Params**:
        - `selector`: "button#create-draft"
    - **Verification**: `verify_desktop_action` -> `type: 'text_present', value: 'Draft Created'`.

## Notes
- State (like the extracted email) must be maintained by the orchestrating agent (e.g., the Business Ops agent), not the Desktop Orchestrator itself.
- If selectors fail, fallback to `execute_complex_flow` with descriptions like "Click the button that says 'Create Draft'".
