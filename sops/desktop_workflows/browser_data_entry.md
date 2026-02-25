# Browser Data Entry SOP

This SOP describes the process for automating data entry into a web form using the Desktop Orchestrator.

## Prerequisites
- Desktop Orchestrator MCP server running.
- Target URL for the form.

## Workflow

1.  **Navigate to the Form**
    - **Action**: Use `navigate_to` tool.
    - **Params**:
        - `url`: "https://example.com/contact" (Replace with actual target)
        - `task_description`: "Navigate to the contact form page."
    - **Verification**: Use `verify_desktop_action` with `type: 'url_contains', value: 'contact'`.

2.  **Fill Name Field**
    - **Action**: Use `type_text` tool.
    - **Params**:
        - `selector`: "input[name='name']" (Adjust selector as needed)
        - `text`: "John Doe"
        - `task_description`: "Type name into the name field."
    - **Verification**: No explicit verification needed if tool returns success, but `verify_desktop_action` with `type: 'element_visible'` could be used.

3.  **Fill Email Field**
    - **Action**: Use `type_text` tool.
    - **Params**:
        - `selector`: "input[name='email']"
        - `text`: "john.doe@example.com"
        - `task_description`: "Type email into the email field."

4.  **Submit Form**
    - **Action**: Use `click_element` tool.
    - **Params**:
        - `selector`: "button[type='submit']"
        - `task_description`: "Click the submit button."
    - **Verification**: Use `verify_desktop_action` with `type: 'text_present', value: 'Thank you'`.

## Fallback Strategy
If `type_text` fails due to selector issues, the orchestrator should attempt to use `execute_complex_flow` with a natural language description (e.g., "Fill the name field with John Doe"), which may route to a vision-based driver (Skyvern or Anthropic).
