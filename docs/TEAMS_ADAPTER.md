# Microsoft Teams Adapter for Simple-CLI

This adapter allows the Simple-CLI agent to operate as a bot within Microsoft Teams channels. It uses the Microsoft Bot Framework SDK to handle messages, @mentions, and other activities.

## Prerequisites

- **Microsoft Azure Account**: Required to register the bot application.
- **ngrok**: For local development and testing (to expose your local server to the internet).
- **Node.js**: Ensure you have Node.js installed (v22+ recommended).

## Setup

### 1. Azure App Registration

1. Go to the [Azure Portal](https://portal.azure.com/).
2. Create a new **Azure Bot** resource.
3. Configure the bot:
   - **Bot Handle**: A unique name for your bot.
   - **Pricing Tier**: Free (F0) is sufficient for testing.
   - **Type of App**: Multi-tenant (unless you have specific requirements).
4. Once created, go to **Configuration** to find your **Microsoft App ID**.
5. Generate a **Client Secret** (Microsoft App Password) in the **Manage Password** section.

### 2. Configuration

You can configure the adapter using environment variables or `mcp.json`.

#### Method A: Environment Variables

Create a `.env` file in the project root:

```env
MicrosoftAppId=<your-app-id>
MicrosoftAppPassword=<your-app-password>
MicrosoftAppType=MultiTenant
MicrosoftAppTenantId=<your-tenant-id> # Optional
PORT=3978
```

#### Method B: `mcp.json`

Add a `teams` section to your `mcp.json`:

```json
{
  "teams": {
    "MicrosoftAppId": "<your-app-id>",
    "MicrosoftAppPassword": "<your-app-password>",
    "MicrosoftAppType": "MultiTenant",
    "port": 3978
  }
}
```

### 3. Running Locally

1. Start ngrok to tunnel traffic to port 3978:
   ```bash
   ngrok http 3978
   ```
   Note the forwarding URL (e.g., `https://<random>.ngrok-free.app`).

2. Update the **Messaging Endpoint** in Azure Portal > Your Bot > Configuration to:
   `https://<random>.ngrok-free.app/api/messages`

3. Start the Teams adapter:
   ```bash
   npm run start:teams
   ```

### 4. Testing in Teams

1. Go to **Test in Web Chat** in the Azure Portal to verify basic connectivity.
2. To test in Teams:
   - Create an App Package (Manifest) using **Developer Portal for Teams**.
   - Or simpler: Use the **Channels** tab in Azure Portal and add **Microsoft Teams**.
   - Click the link to open the bot in Teams.

## Features

- **@Mentions**: The bot responds when mentioned in a channel or group chat.
- **1:1 Chat**: Direct messages work without mentions.
- **Typing Indicators**: Shows "Typing..." while the agent is processing.
- **Rich Responses**: Supports markdown and code blocks (Teams has some markdown limitations).

## Troubleshooting

- **401 Unauthorized**: Check your App ID and Password. Ensure the messaging endpoint is correct.
- **Bot not responding**: Check the console logs for errors. Ensure the agent logic is not crashing.
