# Desktop Orchestration MCP Server

This MCP server provides browser automation capabilities using the [Stagehand](https://stagehand.dev) library. It allows the agent to navigate the web, interact with elements, and extract information.

## Capabilities

- **Navigate**: Go to any URL.
- **Click**: Click elements using CSS selectors.
- **Type**: Type text into input fields.
- **Screenshot**: Capture screenshots of the current page.
- **Extract**: Extract text content from the page or specific elements.

## Configuration

This server is configured to run via `tsx` for local development and `node` for production.

### Environment Variables

- `MCP_DISABLE_DEPENDENCIES`: Set to `true` to prevent the server from trying to install dependencies at runtime (handled by build process).
- `HEADLESS`: Set to `true` to run the browser in headless mode (default: `false`).
- `VIEWPORT_WIDTH`: Set the width of the browser viewport.
- `VIEWPORT_HEIGHT`: Set the height of the browser viewport.
- `STAGEHAND_ENV`: Stagehand environment mode (default: `LOCAL`).
- `STAGEHAND_VERBOSE`: Verbosity level (default: `1`).

## Usage

The server exposes the following tools:

- `desktop_navigate(url)`: Navigate to a specific URL.
- `desktop_click(selector)`: Click an element identified by a CSS selector.
- `desktop_type(selector, text)`: Type text into an input field identified by a CSS selector.
- `desktop_screenshot()`: Take a screenshot of the current page.
- `desktop_extract(selector?)`: Extract text content from an element (or full page if selector is omitted).
- `desktop_shutdown()`: Close the browser and release resources.

## Requirements

- Node.js 18+
- Chromium/Chrome installed (Stagehand/Playwright handles this)
