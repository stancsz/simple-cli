# Simple CLI: Comprehensive Production Deployment Guide

This guide details how to deploy Simple CLI as a robust, multi-tenant digital agency capable of serving multiple clients simultaneously. It covers infrastructure, security, monitoring, and scaling.

## 1. Infrastructure Requirements

### Hardware / VM Specs
To ensure smooth operation, especially when handling multiple concurrent requests or running local embeddings, we recommend:
- **CPU**: 2+ vCPUs (4 recommended for high concurrency)
- **RAM**: 4GB Minimum (8GB recommended if running local models or heavy concurrent tasks)
- **Disk**: 20GB+ SSD (Vector DB grows with usage)
- **OS**: Ubuntu 22.04 LTS or any Docker-compatible Linux distro

### Software
- **Docker Engine**: 24.0+
- **Docker Compose**: 2.20+
- **Node.js**: 22.12.0+ (Only if running outside Docker)

## 2. Multi-Tenant Architecture

Simple CLI uses a **Company Context** system to isolate data between clients.

### Directory Structure
Ensure your host machine has a persistent volume structure:

```bash
/opt/simple-agent/
├── .env                  # Secrets and Keys
├── docker-compose.yml    # Orchestration
├── data/
│   ├── brain/            # Shared Knowledge (LanceDB)
│   ├── companies/        # Client-specific Data
│   │   ├── client-a/     # "Client A" Context
│   │   │   ├── docs/     # Ingested documents
│   │   │   └── config/   # persona.json override
│   │   └── client-b/     # "Client B" Context
│   └── logs/             # System logs
```

### Data Isolation
- **Vector Database**: `EpisodicMemory` creates separate tables for each company (e.g., `episodic_memories_client-a`).
- **Context Injection**: When a task triggers with `--company client-a`, only that client's table and documents are loaded.

## 3. Ghost Mode (Autonomous 24/7 Operation)

The "Ghost Mode" daemon runs background tasks (cron jobs) defined in `mcp.json`.

### Configuration
In `mcp.json` (mapped to the container), define scheduled tasks:

```json
{
  "scheduledTasks": [
    {
      "id": "morning-check-client-a",
      "name": "Daily Status Check",
      "trigger": "cron",
      "schedule": "0 9 * * *",
      "prompt": "Check GitHub issues for urgent bugs.",
      "company": "client-a",
      "yoloMode": true
    }
  ]
}
```

The daemon process (`src/daemon.ts`) ensures these run reliably. If the container restarts, the daemon resumes immediately.

## 4. Interface Configuration

### Slack Integration
1.  **Create App**: Go to [api.slack.com/apps](https://api.slack.com/apps).
2.  **Socket Mode**: Enable Socket Mode to avoid exposing public endpoints.
3.  **Scopes**: Add `app_mentions:read`, `chat:write`, `channels:history`, `files:write`.
4.  **Events**: Subscribe to `app_mention`.
5.  **Environment Variables**:
    ```ini
    SLACK_BOT_TOKEN=xoxb-your-token
    SLACK_APP_TOKEN=xapp-your-socket-token
    SLACK_SIGNING_SECRET=your-secret
    ```

### Microsoft Teams
1.  **Azure Bot**: Create an "Azure Bot" resource.
2.  **App ID/Password**: Generate these in Azure.
3.  **Messaging Endpoint**: For production, use your server's public HTTPS URL (e.g., `https://agent.your-agency.com/api/messages`).
    - *Note:* Teams does not support Socket Mode equivalent; you need an ingress (Nginx/Traefik).
4.  **Environment Variables**:
    ```ini
    MicrosoftAppId=your-app-id
    MicrosoftAppPassword=your-password
    MicrosoftAppType=MultiTenant
    MicrosoftAppTenantId=your-tenant-id (optional)
    ```

## 5. Docker Compose Configuration

Use this production-ready `docker-compose.yml`:

```yaml
services:
  agent:
    image: simple-cli:latest
    container_name: simple-agent
    restart: always
    environment:
      - NODE_ENV=production
      - SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}
      - SLACK_APP_TOKEN=${SLACK_APP_TOKEN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      # ... other keys
    volumes:
      - ./data/brain:/app/.agent/brain
      - ./data/companies:/app/.agent/companies
      - ./data/logs:/app/.agent/logs
      - ./mcp.json:/app/mcp.json
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## 6. Monitoring & Logging

### Logs
- **Container Logs**: `docker logs -f simple-agent` (Standard Output)
- **Application Logs**: Mapped to `./data/logs/daemon.log` and `./data/logs/autonomous.log`.

### Metrics Strategy
- **Health Checks**: The Dockerfile includes a healthcheck (`nc -z localhost 3002`).
- **Uptime**: Monitor the `daemon.log` for heartbeat messages.
- **Alerting**: Use a tool like Filebeat to ship logs to ELK/Splunk and alert on "Error" or "Exception" keywords.

## 7. Backup Procedures

The Brain is file-based (LanceDB), making backups simple.

### Automated Backup Script
Create a cron job on the host:
```bash
#!/bin/bash
TIMESTAMP=$(date +%Y%m%d%H%M)
tar -czf /backups/agent_brain_$TIMESTAMP.tar.gz /opt/simple-agent/data/brain /opt/simple-agent/data/companies
find /backups -name "agent_brain_*" -mtime +7 -delete
```

## 8. Security Considerations

- **Secrets**: Never commit `.env`. Use Docker Secrets in Swarm/K8s if possible.
- **Network**:
    - **Slack**: Outbound only (safe behind NAT).
    - **Teams/Webhooks**: Requires Inbound 443. Use Cloudflare Tunnel or a Reverse Proxy (Nginx) with SSL to protect the endpoint.
- **Rate Limiting**: Configure `persona.json` latency to avoid hitting API limits of LLM providers.

## 9. Scaling

### Vertical Scaling
Increase CPU/RAM as you add more concurrent clients.

### Horizontal Scaling
Since LanceDB is file-based, **single-writer** access is safest.
- **Option A (Shared FS)**: Use EFS/NFS for `/app/.agent/brain`. *Risk: Write locks.*
- **Option B (Sharding)**: Deploy separate agent containers for different sets of clients (e.g., `agent-group-a` handles Clients A-M, `agent-group-b` handles N-Z).

## 10. Troubleshooting

**Issue**: "Database lock error"
- **Fix**: Check if multiple containers are trying to write to the same `.agent/brain` folder. Ensure 1 writer.

**Issue**: "Slack not responding"
- **Fix**: Check `SLACK_APP_TOKEN` (Socket Mode) vs `SLACK_BOT_TOKEN`. Ensure the app is installed in the channel.

**Issue**: "Task not triggering"
- **Fix**: Check `daemon.log` and verify the server time (`date`) matches the CRON schedule.
