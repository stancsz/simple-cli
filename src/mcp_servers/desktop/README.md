# Desktop Orchestration MCP Server

This MCP server provides browser automation capabilities using the [Stagehand](https://stagehand.dev) library. It allows the agent to navigate the web, interact with elements, and extract information.

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

## Usage

The server exposes the following tools:

- `navigate_to(url)`
- `click_element(selector)`
- `type_text(selector, text)`
- `take_screenshot()`
- `extract_page_text()`

## Requirements

- Node.js 18+
- Chromium/Chrome installed (Stagehand/Playwright handles this)
