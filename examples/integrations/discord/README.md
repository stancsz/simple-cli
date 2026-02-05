# Discord Integration

Deploy Simple-CLI as a Discord bot to handle tasks via chat commands.

## Prerequisites

1.  **Node.js** installed.
2.  A **Discord Application** created.
3.  **Simple-CLI** installed (`npm install -g @stan-chen/simple-cli`).

## Setup

1.  **Create a Discord Bot:**
    *   Go to the [Discord Developer Portal](https://discord.com/developers/applications).
    *   Create a new Application.
    *   Go to **Bot** > **Add Bot**.
    *   Enable **Message Content Intent**.
    *   Copy the **Token**.

2.  **Install Dependencies:**
    ```bash
    npm install discord.js dotenv
    ```

3.  **Configuration:**
    Create a `.env` file:
    ```env
    DISCORD_TOKEN=your_bot_token_here
    OPENAI_API_KEY=...
    ```

4.  **Run the Bot:**
    ```bash
    node bot.js
    ```

## Usage

In any channel where the bot is present:

```
!simple Refactor src/utils.ts to use async/await
```

The bot will execute the command using `simple-cli` and reply with the output.
