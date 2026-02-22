# Desktop Orchestration MCP Server

This MCP server provides browser automation capabilities using a pluggable backend architecture. By default, it uses the [Stagehand](https://stagehand.dev) library, but can be configured to use other providers like Anthropic Computer Use or Skyvern.

## Capabilities

- **Navigate**: Go to any URL.
- **Click**: Click elements using CSS selectors.
- **Type**: Type text into input fields.
- **Screenshot**: Capture screenshots of the current page.
- **Extract**: Extract text content from the page.

## Configuration

This server is configured to run via `tsx` for local development and `node` for production.

### Environment Variables

- `MCP_DISABLE_DEPENDENCIES`: Set to `true` to prevent the server from trying to install dependencies at runtime (handled by build process).
- `DESKTOP_BACKEND`: Select the backend to use. Options: `stagehand` (default), `anthropic`, `openai`, `skyvern`.
- `ANTHROPIC_API_KEY`: Required if backend is `anthropic`.
- `OPENAI_API_KEY`: Required if backend is `openai`.
- `SKYVERN_API_KEY`: Required if backend is `skyvern`.

## Usage

The server exposes the following tools:

- `navigate_to(url, taskId?, company?)`
- `click_element(selector, taskId?, company?)`
- `type_text(selector, text, taskId?, company?)`
- `take_screenshot(taskId?, company?)`
- `extract_page_text(taskId?, company?)`

Arguments `taskId` and `company` are optional but recommended for Brain integration (logging interactions).

## Architecture

See [docs/DESKTOP_BACKENDS.md](../../docs/DESKTOP_BACKENDS.md) for details on the backend architecture.
