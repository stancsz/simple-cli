# Desktop Orchestration MCP Server

The **Desktop Orchestration MCP Server** is a unified abstraction layer for visual and desktop automation. It provides a polyglot driver system that intelligently routes tasks to the most appropriate backend.

## Architecture

The server acts as a smart router, dispatching commands to one of the available backends:

1.  **Stagehand (Default)**:
    *   **Best for**: Web automation, form filling, known selectors, speed.
    *   **Mechanism**: Uses Playwright + Stagehand library.
2.  **Anthropic Computer Use** (Active):
    *   **Best for**: Desktop applications, complex visual tasks, OS-level control, when selectors are unknown.
    *   **Mechanism**: Uses Anthropic's Computer Use API (Beta).
3.  **OpenAI Operator** (Active):
    *   **Best for**: High-autonomy research, general web browsing, planning.
    *   **Mechanism**: Uses OpenAI's GPT-4o with a managed browser instance.
4.  **Skyvern** (Active):
    *   **Best for**: "Navigation from scratch", unknown website structures, resilient workflows, form filling.
    *   **Mechanism**: Uses local Playwright for browser control and Skyvern API for vision-based decisions.

## Driver Comparison

| Feature | Stagehand | Anthropic | OpenAI | Skyvern |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Use Case** | Fast, known web flows | Visual / OS control | Research / Planning | Resilient web forms |
| **Speed** | High | Low (Multi-turn API) | Medium | Medium |
| **Cost** | Low (Local) | High (Vision Tokens) | High (GPT-4o) | Medium |
| **Reliability** | High (if selectors static) | High (Visual) | High (Reasoning) | High (Vision) |
| **Setup** | Node.js | API Key | API Key | API Key / Local Server |

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
- "Analyze this chart" / "Use computer" -> Routes to Anthropic.
- "Research the history of AI" / "Browse" -> Routes to OpenAI.
- "Fill out this complex dynamic form" -> Routes to Skyvern.

If no description is provided, it defaults to the configured `preferred_backend`.

## Configuration

Configuration is managed via environment variables and `src/mcp_servers/desktop_orchestrator/config.json`.

### Prerequisites

Ensure you have the following environment variables set in your `.env` file or run environment:

```bash
# For Anthropic Driver
export ANTHROPIC_API_KEY="sk-ant-..."

# For OpenAI Driver
export OPENAI_API_KEY="sk-..."

# For Skyvern (Optional if using Cloud)
export SKYVERN_API_KEY="..."
```

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

## MCP Server Configuration

In `mcp.json`:

```json
"desktop_orchestrator": {
  "command": "npx",
  "args": ["tsx", "src/mcp_servers/desktop_orchestrator/index.ts"],
  "env": {
    "DESKTOP_PREFERRED_BACKEND": "stagehand",
    "MCP_DISABLE_DEPENDENCIES": "true",
    "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}",
    "OPENAI_API_KEY": "${OPENAI_API_KEY}"
  }
}
```
