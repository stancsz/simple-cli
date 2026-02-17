# Microsoft Teams Integration Setup

This guide explains how to set up the Simple-CLI agent as a Microsoft Teams bot.

## Prerequisites

- An Azure subscription (for Azure Bot Service)
- Node.js environment
- Simple-CLI installed and configured

## Azure Bot Setup

1.  **Create an Azure Bot Resource**
    - Go to the [Azure Portal](https://portal.azure.com).
    - Create a new resource and search for "Azure Bot".
    - Choose "Multi Tenant" or "Single Tenant" based on your needs.
    - Note down the `Microsoft App ID` and `Microsoft App Tenant ID`.

2.  **Configure App Password**
    - In the Azure Bot resource, go to "Configuration".
    - Click "Manage Password" next to the App ID.
    - Create a new client secret and copy the `Value`. This is your `Microsoft App Password`.

3.  **Enable Teams Channel**
    - In the Azure Bot resource, go to "Channels".
    - Select "Microsoft Teams".
    - Agree to the terms and save.

## Environment Configuration

Add the following variables to your `.env` file:

```env
MicrosoftAppId=<Your App ID>
MicrosoftAppPassword=<Your App Password>
MicrosoftAppType=MultiTenant # or SingleTenant
MicrosoftAppTenantId=<Your Tenant ID>
PORT=3978
```

## Running the Adapter

You can run the Teams adapter directly:

```bash
node --loader ts-node/esm src/interfaces/teams.ts
```

Or using `npm`:

```bash
npm run start:teams
```

(Note: You may need to add `"start:teams": "node --loader ts-node/esm src/interfaces/teams.ts"` to your `package.json` scripts).

## Exposing Localhost (Dev Mode)

To test locally, use a tunneling service like `ngrok`:

```bash
ngrok http 3978
```

Copy the forwarding URL (e.g., `https://xxxx.ngrok.io`) and update your Azure Bot Configuration:
- Go to "Configuration" in Azure Portal.
- Set "Messaging endpoint" to `https://xxxx.ngrok.io/api/messages`.

## Usage

- Add the bot to a Teams channel or chat.
- Mention the bot (`@BotName`) followed by your instruction.
- The bot will acknowledge, show a typing indicator, and process your request using the configured persona and tools.
