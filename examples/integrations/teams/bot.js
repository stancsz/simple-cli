/**
 * Simple-CLI Microsoft Teams Integration Example
 *
 * Prerequisites:
 * npm install botbuilder restify dotenv @stan-chen/simple-cli
 */
const restify = require('restify');
const { ActivityHandler, CloudAdapter, ConfigurationServiceClientCredentialFactory, createBotFrameworkAuthenticationFromConfiguration } = require('botbuilder');
const { execFile } = require('child_process');
require('dotenv').config();

const server = restify.createServer();
server.use(restify.plugins.bodyParser());

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: process.env.MicrosoftAppId,
    MicrosoftAppPassword: process.env.MicrosoftAppPassword,
    MicrosoftAppType: process.env.MicrosoftAppType,
    MicrosoftAppTenantId: process.env.MicrosoftAppTenantId
});

const botFrameworkAuthentication = createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);
const adapter = new CloudAdapter(botFrameworkAuthentication);

class SimpleAgentBot extends ActivityHandler {
    constructor() {
        super();
        this.onMessage(async (context, next) => {
            const text = context.activity.text.trim();
            await context.sendActivity(`Processing: "${text}"...`);

            // Execute Simple-CLI securely using execFile
            execFile('simple', ['.', text, '--yolo'], { env: process.env }, async (error, stdout, stderr) => {
                let responseText = '';
                if (error) {
                    responseText = `Error: ${error.message}`;
                } else {
                    responseText = stdout;
                }

                // Truncate for Teams
                if (responseText.length > 4000) {
                    responseText = responseText.substring(0, 4000) + '... (truncated)';
                }

                await context.sendActivity(responseText);
            });

            await next();
        });
    }
}

const bot = new SimpleAgentBot();

server.post('/api/messages', async (req, res) => {
    await adapter.process(req, res, (context) => bot.run(context));
});

server.listen(process.env.port || process.env.PORT || 3978, () => {
    console.log(`\n${server.name} listening to ${server.url}`);
});
