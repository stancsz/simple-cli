# Desktop Orchestration MCP Server

The **Desktop Orchestration MCP Server** is a unified abstraction layer for visual and desktop automation. It provides a polyglot driver system that intelligently routes tasks to the most appropriate backend.

## Architecture

The server acts as a smart router, dispatching commands to one of the available backends:

1.  **Stagehand (Default)**:
    *   **Best for**: Web automation, form filling, known selectors, speed.
    *   **Mechanism**: Uses Playwright + Stagehand library.
2.  **Anthropic Computer Use (Beta)**:
    *   **Best for**: Complex visual tasks, semantic instructions ("click the login button"), when selectors are unknown.
    *   **Mechanism**: Uses Anthropic's Claude 3.5 Sonnet Computer Use API + Playwright for execution.
3.  **OpenAI Operator** (Planned/Skeleton):
    *   **Best for**: General web browsing and research.
    *   **Mechanism**: Uses OpenAI's Operator model.
4.  **Skyvern** (Planned/Skeleton):
    *   **Best for**: "Navigation from scratch", unknown website structures, resilient workflows.
    *   **Mechanism**: Vision-based navigation.

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
- "Fill out this complex dynamic form" -> Might route to Skyvern.

If no description is provided, it defaults to the configured `preferred_backend`.

## Configuration

In `mcp.json`:

```json
"desktop_orchestrator": {
  "command": "npx",
  "args": ["tsx", "src/mcp_servers/desktop_orchestrator/index.ts"],
  "env": {
    "DESKTOP_PREFERRED_BACKEND": "stagehand",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "MCP_DISABLE_DEPENDENCIES": "true"
  }
}
```

### Driver Setup

#### Stagehand
- Included by default.
- Requires no extra API keys (unless using LLM features for complex acts).

#### Anthropic Computer Use
- Requires `ANTHROPIC_API_KEY` with access to `computer-use-2024-10-22` beta.
- Uses local Playwright browser (controlled by Stagehand internally) for execution.
- Supports semantic actions like "click the login button" by taking screenshots and asking Claude to locate coordinates.
