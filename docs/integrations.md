---
layout: default
title: Integrations
nav_order: 5
---

# Integrations

Simple-CLI can be integrated into your team's communication channels to provide on-demand assistance directly from Slack, Discord, or Microsoft Teams.

## Overview

The core concept for all integrations is the **Bot Wrapper**:
1.  A lightweight service (Node.js/Python) listens for messages from the platform.
2.  It spawns `simple-cli` as a child process to execute the requested task.
3.  It captures the stdout/stderr and posts it back to the chat.

This approach keeps your bot simple while allowing the full power of Simple-CLI to handle the complex reasoning and tool execution.

## Platform Guides

### Slack
Turn Simple-CLI into a colleague that you can mention in any channel.
*   **Use Case:** "Hey @SimpleCLI, check if the production database backups are current."
*   [View Slack Integration Guide](../../examples/integrations/slack/README.md)

### Discord
Add a research or coding assistant to your community server.
*   **Use Case:** `!simple explain how the new routing algorithm works`
*   [View Discord Integration Guide](../../examples/integrations/discord/README.md)

### Microsoft Teams
Enterprise-grade integration for corporate environments.
*   **Use Case:** Ask the bot to generate a summary of a CSV report attached to the chat.
*   [View Teams Integration Guide](../../examples/integrations/teams/README.md)

## Security Considerations

When exposing Simple-CLI to a chat platform:
*   **Sanitization:** Ensure inputs are sanitized to prevent command injection (though `simple-cli` treats the prompt as natural language, the wrapper should be careful).
*   **Permissions:** Run the bot process with the least privilege necessary. Do not run as root.
*   **Environment:** Ensure the bot has access to the tools/files it needs, but nothing more. Using Docker to sandbox the execution environment is recommended.
*   **Cost Control:** Monitor API usage, as public bots can generate significant LLM costs.
