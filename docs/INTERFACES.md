# Multi-Platform Interfaces

Simple-CLI supports running as a persistent digital coworker on various communication platforms. This allows your team to interact with the agent directly where they work, using natural language to delegate tasks, ask questions, or run workflows.

## Discord

The Discord interface allows Simple-CLI to run as a bot in your Discord server.

### Prerequisites

1.  **Create a Discord Application**:
    *   Go to the [Discord Developer Portal](https://discord.com/developers/applications).
    *   Click "New Application" and give it a name (e.g., "Jules").
2.  **Create a Bot**:
    *   Navigate to the **Bot** tab.
    *   Click "Add Bot".
    *   Enable **Message Content Intent** (required to read messages).
    *   Copy the **Token**. You will need this for the `DISCORD_BOT_TOKEN` environment variable.
3.  **Invite the Bot**:
    *   Navigate to the **OAuth2** -> **URL Generator** tab.
    *   Select `bot` scope.
    *   Select the following permissions:
        *   Read Messages/View Channels
        *   Send Messages
        *   Send Messages in Threads
        *   Read Message History
        *   Add Reactions
    *   Copy the generated URL and open it in your browser to invite the bot to your server.

### Configuration

Set the following environment variable in your `.env` file or environment:

```bash
DISCORD_BOT_TOKEN=your_bot_token_here
```

### Running the Discord Interface

You can start the Discord interface using the CLI flag:

```bash
simple --interface discord
```

Or directly via Node:

```bash
node --loader ts-node/esm src/interfaces/discord.ts
```

### Interaction

*   **Mentions**: The bot will respond when mentioned (e.g., `@Jules help me with this bug`).
*   **DM**: The bot will respond to all Direct Messages.
*   **Ping**: Send `!ping` to verify the bot is online.
*   **Typing**: The bot simulates typing while processing your request.

### Docker Compose

Example service configuration for `docker-compose.yml`:

```yaml
  discord-agent:
    build: .
    command: npm start -- --interface discord
    environment:
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      # ... other keys
    volumes:
      - ./.agent:/app/.agent
    restart: unless-stopped
```

## Slack

(See `src/interfaces/slack.ts` for implementation details)

The Slack interface uses the Slack Bolt framework. Requires `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET`.

## Microsoft Teams

(See `docs/TEAMS_ADAPTER.md` for detailed setup)

The Teams interface uses the Microsoft Bot Framework. Requires `MicrosoftAppId` and `MicrosoftAppPassword`.
