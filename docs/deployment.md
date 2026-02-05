---
layout: default
title: Deployment
nav_order: 4
---

# Deployment

Simple-CLI is designed to run anywhere Node.js runs. While typically used interactively, it is powerful when deployed as an autonomous agent in CI/CD pipelines or cloud environments.

## GitHub Actions

Deploying Simple-CLI in GitHub Actions allows you to:
*   Perform automated code reviews on Pull Requests.
*   Run security audits on every push.
*   Generate documentation automatically.

### Quick Start

1.  Create `.github/workflows/agent.yml` in your repository.
2.  Use the following configuration:

```yaml
name: Simple-CLI Agent
on: [push, pull_request]

jobs:
  run-agent:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Agent
        run: npm install -g @stan-chen/simple-cli

      - name: Run Task
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          simple . "Review this code for performance issues" --yolo
```

### Key Flags for CI/CD

*   `--yolo`: **Crucial for CI.** Skips all interactive confirmation prompts (tool execution, file writes).
*   `--claw "intent"`: Spawns a specialized JIT agent for the task.
*   `--swarm config.json`: Runs multiple agents in parallel for large refactors.

See [examples/ci-cd/github-actions](../../examples/ci-cd/github-actions/README.md) for more advanced workflows.

## Docker

You can containerize Simple-CLI for deployment on ECS, Kubernetes, or DigitalOcean App Platform.

```dockerfile
FROM node:20-alpine

RUN npm install -g @stan-chen/simple-cli

WORKDIR /app
COPY . .

# Keep container alive or run a specific command
CMD ["simple", ".", "Monitor the logs directory", "--ghost"]
```

## Scheduled Tasks (Cron)

Use `cron` on a Linux server to run the agent periodically:

```bash
# Run a daily report at 8 AM
0 8 * * * export OPENAI_API_KEY=sk-...; simple /var/www/html "Generate a daily traffic report" --yolo >> /var/log/daily-report.log
```
