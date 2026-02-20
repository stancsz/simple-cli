# Dify MCP Server

This MCP server integrates with [Dify](https://dify.ai/) to allow local deployment and execution of agent workflows.

## Configuration

Set the following environment variables:

- `DIFY_API_URL`: The base URL of your Dify API (default: `http://localhost:5001/v1`).
- `DIFY_API_KEY`: Your Dify API Key. Note that for `deploy_workflow` (app creation), you may need a Workspace API Key or console access, depending on your Dify setup. For `trigger_agent`, you can provide an App-specific API Key either via this env var or as an argument.

## Tools

### `deploy_workflow`
Deploys or creates a new agent/workflow in Dify using a JSON configuration.
- `config`: JSON string matching the Dify App DSL (see `dify_agent_templates/`).
- `name`: (Optional) Name of the agent.

### `trigger_agent`
Triggers an agent execution.
- `query`: User query.
- `inputs`: JSON string of input variables.
- `user`: User identifier (default: `simple-cli-user`).
- `conversation_id`: (Optional) For continuing a chat.
- `api_key`: (Optional) Override the default API Key for this specific agent.

### `get_conversation`
Retrieves conversation history.
- `conversation_id`: The ID of the conversation.
- `user`: User identifier.
- `limit`: Number of messages (default: 20).
- `api_key`: (Optional) Override the default API Key.
