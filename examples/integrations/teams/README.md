# Microsoft Teams Integration

Run Simple-CLI as a Bot Framework bot in Microsoft Teams.

## Prerequisites

1.  **Node.js** installed.
2.  An **Azure Bot Resource** or Bot Framework registration.
3.  **Simple-CLI** installed (`npm install -g @stan-chen/simple-cli`).

## Setup

1.  **Register a Bot:**
    *   Use the [Bot Framework](https://dev.botframework.com/) or Azure Portal to create a bot registration.
    *   Get your `MicrosoftAppId` and `MicrosoftAppPassword`.

2.  **Install Dependencies:**
    ```bash
    npm install botbuilder restify dotenv
    ```

3.  **Configuration:**
    Create a `.env` file:
    ```env
    MicrosoftAppId=...
    MicrosoftAppPassword=...
    MicrosoftAppType=MultiTenant
    MicrosoftAppTenantId=...
    OPENAI_API_KEY=...
    ```

4.  **Run the Bot:**
    ```bash
    node bot.js
    ```
    *   You will need to use a tunneling service like `ngrok` to expose your local port 3978 to the internet if developing locally.
    *   Set the Messaging Endpoint in your Bot config to `https://<your-ngrok-url>/api/messages`.

## Usage

Message the bot in Teams:

```
Analyze the quarterly_report.csv
```

The bot will process the request using `simple-cli` and return the results.
