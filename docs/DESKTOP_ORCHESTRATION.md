# Desktop Orchestration MCP Server

The **Desktop Orchestration MCP Server** is a unified abstraction layer for visual and desktop automation. It provides a polyglot driver system that intelligently routes tasks to the most appropriate backend.

## Architecture

The server acts as a smart router, dispatching commands to one of the available backends:

1.  **Stagehand (Default)**:
    *   **Best for**: Web automation, form filling, known selectors, speed.
    *   **Mechanism**: Uses **Playwright** directly for CSS selectors (fast/reliable) and **Stagehand** AI for natural language instructions. Includes robust fallback to raw Playwright if Stagehand library fails.
2.  **Anthropic Computer Use** (Active):
    *   **Best for**: Complex visual tasks, dynamic interfaces, or when selectors are unknown/unstable.
    *   **Mechanism**: Uses Anthropic's **Computer Use API** (Claude 3.5 Sonnet) to visually analyze the screen and emit coordinate-based actions (click, type). Implements a multi-turn agent loop.
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

## Driver Comparison

| Feature | Stagehand | Anthropic | Skyvern | OpenAI (Planned) |
| :--- | :--- | :--- | :--- | :--- |
| **Speed** | ⚡️ Fast (Local) | 🐢 Slower (API) | 🐢 Slower (API) | - |
| **Reliability** | High (CSS selectors) | High (Vision) | High (Vision) | - |
| **Cost** | Low/Free (Local LLM) | High (Per Token) | Medium | - |
| **Best Use Case** | Forms, Static Sites | Complex Apps, Canvas | Unknown Structure | Research |
| **Mechanism** | Playwright / Stagehand | Computer Use API | Skyvern API | Operator |

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
