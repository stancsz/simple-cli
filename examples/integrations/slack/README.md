# Slack Integration

Run Simple-CLI as a Slack bot to allow your team to trigger agent tasks directly from channels.

## Prerequisites

1.  **Node.js** installed.
2.  A **Slack App** created in your workspace.
3.  **Simple-CLI** installed (`npm install -g @stan-chen/simple-cli`).

## Setup

1.  **Create a Slack App:**
    *   Go to [api.slack.com/apps](https://api.slack.com/apps).
    *   Create a new app.
    *   Enable **Socket Mode** (recommended for local testing) or set up a public endpoint for **Event Subscriptions**.
    *   Add the `app_mention` event in **Event Subscriptions**.
    *   Add scopes: `app_mentions:read`, `chat:write`.

2.  **Install Dependencies:**
    ```bash
    npm install @slack/bolt dotenv
    ```

3.  **Configuration:**
    Create a `.env` file:
    ```env
    SLACK_BOT_TOKEN=xoxb-...
    SLACK_SIGNING_SECRET=...
    SLACK_APP_TOKEN=xapp-... (if using Socket Mode)
    OPENAI_API_KEY=...
    ```

4.  **Run the Bot:**
    ```bash
    node bot.js
    ```

## Usage

In Slack, invite the bot to a channel and mention it:

```
@SimpleCLI Audit the utils/ folder for unused functions
```

The bot will spawn a `simple-cli` process, execute the task, and post the output back to the thread.
