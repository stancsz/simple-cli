# Desktop Orchestration MCP Server

The **Desktop Orchestration MCP Server** is a unified abstraction layer for visual and desktop automation. It provides a polyglot driver system that intelligently routes tasks to the most appropriate backend.

## Architecture

The server acts as a smart router, dispatching commands to one of the available backends:

1.  **Stagehand (Default)**:
    *   **Best for**: Web automation, form filling, known selectors, speed.
    *   **Mechanism**: Uses Playwright + Stagehand library.
2.  **Anthropic Computer Use** (Planned/Skeleton):
    *   **Best for**: Desktop applications, complex visual tasks, when selectors are unknown.
    *   **Mechanism**: Uses Anthropic's Computer Use API.
3.  **OpenAI Operator** (Planned/Skeleton):
    *   **Best for**: General web browsing and research.
    *   **Mechanism**: Uses OpenAI's Operator model.
4.  **Skyvern** (Active):
    *   **Best for**: "Navigation from scratch", unknown website structures, resilient workflows, form filling.
    *   **Mechanism**: Uses local Playwright for browser control and Skyvern API for vision-based decisions (requires a running Skyvern instance or API access).

## Tools

The server exposes the following MCP tools:

- `navigate_to(url, task_description?)`: Navigate to a URL.
- `click_element(selector, task_description?)`: Click a specific element.
- `type_text(selector, text, task_description?)`: Type text.
- `take_screenshot(task_description?)`: Capture screen.
- `extract_page_text(task_description?)`: Get text content.
- `execute_complex_flow(goal, task_description?)`: Execute a high-level goal (e.g., "Login to Gmail and check for invoices").

## Smart Routing

The `task_description` parameter helps the Orchestrator decide which backend to use.
- "Use Stagehand to click the button" -> Forces Stagehand.
- "Analyze this chart" -> Might route to Anthropic (if enabled).
- "Fill out this complex dynamic form" -> Routes to Skyvern.

If no description is provided, it defaults to the configured `preferred_backend`.

## Visual Quality Gate (QA)

The **Visual Quality Gate** is an automated QA layer integrated into the Supervisor. It activates when a task involves visual output (e.g., `take_screenshot` or "design this page").

### How it works:
1.  **Detection:** The Supervisor detects visual intent or image artifacts in the tool output.
2.  **Analysis:** It sends the screenshot to the `visual_quality_gate` MCP server.
3.  **Critique:** A Vision LLM (Claude 3.5 Sonnet / GPT-4o) evaluates the design against modern aesthetic standards (Typography, Color, Layout, Polish).
4.  **Scoring:** It returns a score (0-100) and a list of critiques.
5.  **Rejection:** If the score is < 70, the task is rejected, and the agent is instructed to improve the design based on the feedback.

### Company Context
The Quality Gate respects brand guidelines loaded from `.agent/companies/<company>.json`. It injects the "Brand Voice" into the evaluation prompt to ensure consistency.

## Configuration

Configuration is managed via `src/mcp_servers/desktop_orchestrator/config.json`.

### Skyvern Configuration

To use Skyvern, ensure you have a running Skyvern instance (e.g., via Docker on port 8000) or an API key for Skyvern Cloud.

```json
{
  "desktop_orchestrator": {
    "preferred_backend": "stagehand",
    "drivers": {
      "skyvern": {
        "api_base": "http://localhost:8000",
        "api_key": null,
        "timeout": 30000,
        "cdp_port": 9222
      }
    }
  }
}
```

- `api_base`: The URL of the Skyvern API (default: `http://localhost:8000`).
- `api_key`: Your Skyvern API key (if using Cloud or authenticated instance).
- `cdp_port`: The remote debugging port for the local browser (default: 9222). Skyvern uses this to inspect the browser state via CDP.

## MCP Server Configuration

In `mcp.json`:

```json
"desktop_orchestrator": {
  "command": "npx",
  "args": ["tsx", "src/mcp_servers/desktop_orchestrator/index.ts"],
  "env": {
    "DESKTOP_PREFERRED_BACKEND": "stagehand",
    "MCP_DISABLE_DEPENDENCIES": "true"
  }
}
```
