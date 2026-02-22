# Desktop MCP Server Backends

The Desktop MCP server features a pluggable backend architecture, allowing it to leverage different providers for visual interaction and browser automation. This design enables the Orchestrator to select the most appropriate tool for the job—whether it's a local, cost-free automation via Stagehand or a complex, reasoned interaction via Anthropic's Computer Use.

## Architecture

The server exposes a unified set of MCP tools:
- `navigate_to(url)`
- `click_element(selector)`
- `type_text(selector, text)`
- `take_screenshot()`
- `extract_page_text()`

Internally, these tools delegate execution to a configured `DesktopBackend`.

## Supported Backends

### 1. Stagehand (Default)
Uses `@browserbasehq/stagehand` and Playwright. Best for local development, testing, and reliable, deterministic automation.

**Configuration:**
- `DESKTOP_BACKEND="stagehand"` (Default)

### 2. Anthropic Computer Use (Beta)
Leverages Anthropic's Computer Use capabilities (via API/SDK). ideal for complex, reasoning-heavy visual tasks.
*Status: Stub/Experimental.*

**Configuration:**
- `DESKTOP_BACKEND="anthropic"`
- `ANTHROPIC_API_KEY`: Required.

### 3. OpenAI Operator
Uses OpenAI's operator capabilities.
*Status: Stub/Experimental.*

**Configuration:**
- `DESKTOP_BACKEND="openai"`
- `OPENAI_API_KEY`: Required.

### 4. Skyvern
Uses Skyvern's visual automation API.
*Status: Stub/Experimental.*

**Configuration:**
- `DESKTOP_BACKEND="skyvern"`
- `SKYVERN_API_KEY`: Required.

## Brain Integration

All visual interactions are automatically logged to the Brain (Episodic Memory) if a `taskId` is provided in the tool call. This enables the agent to:
1. **Recall** past UI interactions (e.g., "How did I login to AWS last time?").
2. **Learn** from failures (e.g., "Selector #submit changed to #login-btn").
3. **Optimize** future workflows based on past success.

## Development

To add a new backend:
1. Implement the `DesktopBackend` interface in `src/mcp_servers/desktop/interfaces/DesktopBackend.ts`.
2. Register the backend in `src/mcp_servers/desktop/index.ts`.
3. Ensure the new backend handles standard `DesktopBackend` methods (`navigate_to`, `click_element`, etc.).
