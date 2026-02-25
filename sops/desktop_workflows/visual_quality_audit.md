# Visual Quality Audit SOP

This SOP describes how to use the Desktop Orchestrator to perform a visual quality audit on a web page using AI-driven aesthetic scoring.

## Prerequisites
- Desktop Orchestrator MCP server running.
- Target URL for the audit.

## Workflow

1.  **Navigate to Target Page**
    - **Action**: Use `navigate_to` tool.
    - **Params**:
        - `url`: "https://example.com/landing-page" (Replace with actual target)
        - `task_description`: "Navigate to the landing page for visual audit."
    - **Verification**: Use `verify_desktop_action` with `type: 'url_contains', value: 'landing-page'`.

2.  **Perform Visual Assessment**
    - **Action**: Use `assess_page_quality` tool.
    - **Params**:
        - `task_description`: "Assess the visual quality of this landing page. It should look modern, clean, and professional."
    - **Output Analysis**:
        - The tool returns a JSON object with `score`, `critique`, and `reasoning`.
        - **Pass Criteria**: Score >= 70.
        - **Fail Criteria**: Score < 70.

3.  **Log Results (Manual or Automated)**
    - If the score is below 70, create a ticket (e.g., in Linear via `business_ops`) with the critique points.
    - If the score is passing, log the success.

## Example Output
```json
{
  "score": 85,
  "critique": [
    "Contrast on the CTA button could be higher.",
    "Footer spacing is inconsistent."
  ],
  "reasoning": "The page generally looks professional with good use of whitespace and typography, but minor details in the footer and buttons need polish."
}
```
