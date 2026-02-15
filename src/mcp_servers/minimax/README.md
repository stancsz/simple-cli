# Minimax MCP Server

This MCP server integrates Minimax models (compatible with Anthropic API).

## Tools

### `minimax_chat`

Interacts with Minimax models (e.g., MiniMax-M2.5) using the Anthropic-compatible API.

**Arguments:**

- `messages`: Array of messages (Anthropic format).
- `model`: Model name (default: "MiniMax-M2.5").
- `max_tokens`: Max tokens (default: 1024).
- `temperature`: Temperature (0-1).
- `system`: System prompt.
- `tools`: Tool definitions.
- `tool_choice`: Tool choice configuration.
- `top_p`: Nucleus sampling.
- `thinking`: Configuration for reasoning content (e.g., `{ type: "enabled", budget_tokens: 1024 }`).
- `metadata`: Metadata for the request.

## Usage

Set the environment variable `MINIMAX_API_KEY` (recommended) or `ANTHROPIC_API_KEY`.

```bash
export MINIMAX_API_KEY=your_key_here
```

The server will automatically be discovered by the MCP client in this project.
