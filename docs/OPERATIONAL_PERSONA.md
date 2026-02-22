# Operational Persona: Sarah_DevOps

The Operational Persona Bridge (`src/mcp_servers/operational_persona/`) provides a human-like interface for system monitoring and agent activity reporting. It integrates the Health Monitor and Brain MCPs to generate natural language updates in the voice of "Sarah_DevOps".

## Capabilities

1.  **System Status Reports**: Aggregates health metrics (latency, errors, tokens) into a concise status update.
2.  **Agent Activity Summaries**: Queries the Brain for recent autonomous actions (Job Delegator, Reviewer, Dreaming).
3.  **Daily Standups**: Generates a combined report at 9 AM and posts it to Slack.

## Configuration

The server is configured via `docker-compose.yml` and `mcp.docker.json`.

### Environment Variables

- `SLACK_WEBHOOK_URL`: (Optional) URL for posting daily standups to Slack/Teams.
- `PORT`: Port for the SSE server (default: 3005).

### Tools

- `get_system_status`: Returns current system health (e.g., "🟢 Systems nominal").
- `get_agent_activity_report`: Returns a summary of recent agent actions.
- `generate_daily_standup(post: boolean)`: Generates a full report and optionally posts to Slack.

## Usage

### Manual Query (via Agent)

You can ask the agent:
> "What is the system status?"
> "Give me a summary of last night's agent activities."

The agent will use the `operational_persona` tools to answer.

### Scheduled Standups

The Scheduler is configured to run `generate_daily_standup` daily at 9 AM. Ensure `SLACK_WEBHOOK_URL` is set in your `.env` file and passed to the container.

## Architecture

The Operational Persona runs as a standalone MCP server service. It internally spawns client connections to the `health_monitor` and `brain` servers (running as subprocesses sharing the `.agent` volume) to gather data without direct code dependencies.
