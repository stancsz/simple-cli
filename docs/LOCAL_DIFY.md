# Local Dify Setup for Simple CLI

This guide describes how to run the Dify orchestration layer locally using the `docker-compose.dify.yml` configuration included in this repository.

## Prerequisites

- **Docker** and **Docker Compose** installed.
- **Git** installed.
- **API Keys**: DeepSeek API Key (for Coding Agent), Anthropic API Key (optional, for Supervisor).

## 1. Start the Dify Stack

To start the local Dify services (API, Web, Worker, DB, Redis), run the following command from the project root:

```bash
docker compose -f docker-compose.dify.yml up -d
```

This will spin up:
- **Dify Web Interface**: [http://localhost:3003](http://localhost:3003)
- **Dify API**: [http://localhost:5001](http://localhost:5001)
- **PostgreSQL**: Port 5433 (isolated from other services)
- **Redis**: Port 6380 (isolated from other services)

## 2. Initial Setup

1.  Open [http://localhost:3003/install](http://localhost:3003/install) in your browser.
2.  Create an admin account to proceed.
3.  Go to **Settings > Model Provider** and add your API keys:
    -   **DeepSeek**: For the Coding Agent.
    -   **Anthropic**: For the Supervisor Agent (Claude 3.5 Sonnet).

## 3. Importing Agent Templates

We have provided pre-configured agent templates in `dify_agent_templates/`.

### Supervisor Agent
- **File**: `dify_agent_templates/supervisor_agent.json`
- **Role**: Analyzes requirements and creates implementation plans.
- **Model**: Claude 3.5 Sonnet.

### Coding Agent
- **File**: `dify_agent_templates/coding_agent.json`
- **Role**: Implements code based on plans.
- **Model**: DeepSeek Coder V2.

*Note: Currently, Dify allows creating apps from templates via DSL import. If the import feature requires a specific DSL format different from the JSON provided, use the JSON files as a reference to manually configure the System Prompt and Model Settings in the Studio.*

## 4. Integration with Simple CLI

You can interact with this local Dify instance using Simple CLI's `http` tools or by creating a custom MCP server that talks to the Dify API.

**Example API Call:**
```bash
curl -X POST 'http://localhost:5001/v1/chat-messages' \
--header 'Authorization: Bearer {YOUR_DIFY_APP_API_KEY}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "inputs": {},
    "query": "Create a snake game in Python",
    "response_mode": "blocking",
    "conversation_id": "",
    "user": "simple-cli-user"
}'
```

## 5. Stopping the Stack

To stop the services and remove containers:

```bash
docker compose -f docker-compose.dify.yml down
```

To stop and remove volumes (reset data):

```bash
docker compose -f docker-compose.dify.yml down -v
```
