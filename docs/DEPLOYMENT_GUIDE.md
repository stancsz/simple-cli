# Deployment Guide

This guide covers how to deploy the Simple CLI agent in a production environment, including configuring Personas and Company Contexts.

## Prerequisites

- Node.js 22.12.0+
- Docker & Docker Compose (optional but recommended)
- API Keys for LLM providers (OpenAI, Anthropic, etc.)
- Slack/Teams App credentials (if using interfaces)

## 1. Persona Configuration

The **Persona Engine** allows you to customize the agent's voice, tone, and behavior to match your team's culture.

### Configuration File
Create or edit `.agent/config/persona.json`:

```json
{
  "name": "Sarah_DevOps",
  "role": "DevOps Engineer",
  "voice": {
    "tone": "Professional, efficient, and slightly witty"
  },
  "emoji_usage": true,
  "catchphrases": {
    "greeting": ["Hey team!", "Hello folks!"],
    "signoff": ["Cheers!", "Happy coding!"],
    "filler": ["Let me check that...", "One moment..."]
  },
  "working_hours": "09:00-17:00",
  "response_latency": {
    "min": 500,
    "max": 2000
  },
  "enabled": true
}
```

### Key Settings
- **working_hours**: Enforces availability. Outside these hours, the agent will reply with an "Out of Office" message unless urgent overrides are implemented.
- **response_latency**: Simulates human typing speed. The delay is proportional to response length, clamped between `min` and `max` milliseconds.
- **voice.tone**: Instructions injected into the system prompt to guide LLM style.

## 2. Company Context (Multi-Tenant RAG)

For agencies or consultants managing multiple clients, use **Company Context** to isolate data and brand knowledge.

### Directory Structure
Organize client data in `.agent/companies/`:

```
.agent/companies/
├── client-a/
│   ├── config/
│   │   └── persona.json  (Optional override)
│   ├── docs/
│   │   ├── brand_guidelines.md
│   │   ├── architecture.txt
│   │   └── api_specs.md
│   └── brain/            (Auto-generated Vector DB)
└── client-b/
    ├── docs/
    │   └── ...
```

### Ingestion
To ingest documents into the vector database:
1. Place markdown or text files in `.agent/companies/<company_id>/docs/`.
2. Run the agent with the company context loaded:
   ```bash
   simple --company client-a
   ```
   Or use the `load_company_context` tool explicitly via MCP.

### Usage
When running the agent, specify the company context:

**CLI:**
```bash
simple "Draft a blog post" --company client-a
```

**Slack:**
```
@Agent --company client-a Draft a blog post
```

The agent will:
1. Load the specific `persona.json` for that company (if present).
2. Retrieve relevant documents from `client-a`'s vector database (RAG).
3. Ensure no data leaks from `client-b`.

## 3. Production Deployment (Docker)

Use the provided `docker-compose.yml` to spin up a full stack including Redis (for caching) and the Agent.

```bash
docker-compose up -d
```

Ensure your `.env` file contains all necessary API keys.

## 4. Health Monitoring

For production observability, Simple CLI includes a built-in monitoring system.

1.  **Metrics Collection**: The agent automatically logs performance metrics to `.agent/metrics/`. Ensure this directory is persisted in your Docker volume configuration.
2.  **Dashboard**: A lightweight web dashboard is available to visualize agent health.
    - Start it with: `node scripts/dashboard/server.js`
    - Access at: `http://localhost:3003`
3.  **Alerts**: Configure alerts for high latency or error rates in `scripts/dashboard/alert_rules.json`.
