import "dotenv/config";
import {
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  ActivityHandler,
  TurnContext,
  MessageFactory,
  ActivityTypes
} from "botbuilder";
import express from "express";
import { Engine, Context, Registry } from "../engine/orchestrator.js";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { getActiveSkill } from "../skills.js";
import { WorkflowEngine } from "../workflows/workflow_engine.js";
import { createExecuteSOPTool } from "../workflows/execute_sop_tool.js";
import { fileURLToPath } from "url";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { SOPEngineServer } from "../mcp_servers/sop_engine/index.js";

// Custom Engine to capture output and stream to Teams
export class TeamsEngine extends Engine {
  private turnContext: TurnContext;

  constructor(
    llm: any,
    registry: Registry,
    mcp: MCP,
    turnContext: TurnContext
  ) {
    super(llm, registry, mcp);
    this.turnContext = turnContext;

    // Override spinner to stream updates to Teams
    this.s = {
      start: (msg: string) => {
        this.log('info', `[Start] ${msg}`);
        if (msg === "Typing...") {
            this.turnContext.sendActivity({ type: ActivityTypes.Typing }).catch(() => {});
        }
      },
      stop: (msg: string) => this.log('success', `[Done] ${msg}`),
      message: (msg: string) => this.log('info', `[Update] ${msg}`),
    } as any;
  }

  // Override run to check working hours
  async run(
    ctx: Context,
    initialPrompt?: string,
    options: { interactive: boolean; company?: string } = { interactive: true },
  ) {
      await this.llm.personaEngine.loadConfig();
      if (!this.llm.personaEngine.isWithinWorkingHours()) {
          const hours = this.llm.personaEngine.getConfig()?.working_hours || "unknown";
          const msg = this.llm.personaEngine.formatMessage(`I am currently offline. My working hours are ${hours}.`);
          await this.turnContext.sendActivity(msg);
          return;
      }
      await super.run(ctx, initialPrompt, options);
  }

  // Override log to send updates to Teams conversation
  protected override log(type: 'info' | 'success' | 'warn' | 'error', message: string) {
    // Filter out verbose logs
    if (message.includes("Tokens:") || message.includes("prompt +")) return;

    let icon = "";
    if (type === 'success') icon = "✅ ";
    else if (type === 'warn') icon = "⚠️ ";
    else if (type === 'error') icon = "❌ ";
    else if (type === 'info') icon = "ℹ️ ";

    this.turnContext.sendActivity(`${icon} ${message}`).catch((err) => {
      console.error("Failed to log to Teams:", err);
    });

    // Also log to console
    super.log(type, message);
  }

  protected async getUserInput(initialValue: string, interactive: boolean): Promise<string | undefined> {
    this.log('warn', "Agent requested input, but interactive mode is disabled in Teams adapter.");
    return undefined;
  }
}

// Global instances
const baseRegistry = new Registry();
const mcp = new MCP();
let isInitialized = false;

export function resetInitialization() {
  isInitialized = false;
}

async function initializeResources() {
  if (isInitialized) return;

  const workflowEngine = new WorkflowEngine(baseRegistry);
  const sopTool = createExecuteSOPTool(workflowEngine);
  baseRegistry.tools.set(sopTool.name, sopTool as any);

  await mcp.init();

  // Ensure essential servers are started
  const coreServers = ["filesystem", "git", "context_server", "company_context", "aider-server", "claude-server", "openclaw"];
  for (const s of coreServers) {
    try {
      if (!mcp.isServerRunning(s)) await mcp.startServer(s);
    } catch (e) {
      console.warn(`Failed to start core server ${s}:`, e);
    }
  }

  (await mcp.getTools()).forEach((t) => baseRegistry.tools.set(t.name, t as any));

  isInitialized = true;
}

// Load Configuration
function loadConfiguration() {
  let config = {
    MicrosoftAppId: process.env.MicrosoftAppId || process.env.MICROSOFT_APP_ID || "",
    MicrosoftAppPassword: process.env.MicrosoftAppPassword || process.env.MICROSOFT_APP_PASSWORD || "",
    MicrosoftAppType: process.env.MicrosoftAppType || "MultiTenant",
    MicrosoftAppTenantId: process.env.MicrosoftAppTenantId || process.env.MICROSOFT_APP_TENANT_ID || "",
    port: process.env.PORT || 3978
  };

  const mcpConfigPath = join(process.cwd(), "mcp.json");
  if (existsSync(mcpConfigPath)) {
    try {
      const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, "utf-8"));
      if (mcpConfig.teams) {
        config = { ...config, ...mcpConfig.teams };
      }
    } catch (e) {
      console.error("Error loading mcp.json:", e);
    }
  }
  return config;
}

const config = loadConfiguration();

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: config.MicrosoftAppId,
  MicrosoftAppPassword: config.MicrosoftAppPassword,
  MicrosoftAppType: config.MicrosoftAppType,
  MicrosoftAppTenantId: config.MicrosoftAppTenantId
});

const botFrameworkAuthentication = createBotFrameworkAuthenticationFromConfiguration(
  null,
  credentialsFactory
);

const adapter = new CloudAdapter(botFrameworkAuthentication);

adapter.onTurnError = async (context, error) => {
  console.error(`\n [onTurnError] unhandled error: ${error}`);
  await context.sendActivity('The bot encountered an error or bug.');
  await context.sendActivity('To continue to run this bot, please fix the bot source code.');
};

class TeamsBot extends ActivityHandler {
  constructor() {
    super();

    this.onMessage(async (context, next) => {
      const activity = context.activity;

      // 1. Add reaction (👍)
      if (activity.id) {
        try {
          await context.sendActivities([
            {
              type: ActivityTypes.MessageReaction,
              reactionsAdded: [{ type: 'like' }],
              replyToId: activity.id
            }
          ]);
        } catch (e) {
          // Ignore if reaction fails
        }
      }

      // 2. Handle attachments (Basic acknowledgement)
      if (activity.attachments && activity.attachments.length > 0) {
        const fileNames = activity.attachments.map(a => a.name || 'unnamed_file').join(', ');
        await context.sendActivity(`Received attachments: ${fileNames}. (File processing is limited in this version)`);
      }

      const text = TurnContext.removeRecipientMention(activity);
      const cleanText = text.trim();

      let prompt = cleanText;
      const companyMatch = prompt.match(/--company\s+([a-zA-Z0-9_-]+)/);
      const company = companyMatch ? companyMatch[1] : undefined;
      if (company) {
          prompt = prompt.replace(/--company\s+[a-zA-Z0-9_-]+/, "").trim();
      }

      // 3. Send typing indicator
      await context.sendActivity({ type: ActivityTypes.Typing });

      // 4. Acknowledge
      await context.sendActivity("Thinking...");

      // 3. Initialize and Run
      if (!isInitialized) {
        await initializeResources();
      }

      // Create request-specific registry
      const requestRegistry = new Registry();
      for (const [name, tool] of baseRegistry.tools) {
        requestRegistry.tools.set(name, tool);
      }

      const cwd = process.cwd();
      const provider = createLLM();
      const engine = new TeamsEngine(provider, requestRegistry, mcp, context);
      const skill = await getActiveSkill(cwd);
      const ctx = new Context(cwd, skill);

      try {
        await engine.run(ctx, prompt, { interactive: false, company });

        const lastMessage = ctx.history.filter(m => m.role === "assistant").pop();
        if (lastMessage) {
          let content = lastMessage.content;
          try {
            const parsed = JSON.parse(content);
            if (parsed.message) content = parsed.message;
            else if (parsed.thought) content = parsed.thought;
          } catch { }

          if (content) {
            await context.sendActivity(content);
          } else {
            await context.sendActivity("Task completed (check logs/artifacts).");
          }
        } else {
            // Check if persona prevented response
            await provider.personaEngine.loadConfig();
            if (provider.personaEngine.isWithinWorkingHours()) {
                 await context.sendActivity("I couldn't generate a response.");
            }
        }
      } catch (error: any) {
        console.error("Error running engine:", error);
        await context.sendActivity(`Error: ${error.message}`);
      }

      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      const welcomeText = 'Hello and welcome! I am your AI coding assistant.';
      for (const member of membersAdded || []) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(MessageFactory.text(welcomeText, welcomeText));
        }
      }
      await next();
    });
  }
}

const bot = new TeamsBot();
const app = express();
app.use(express.json());

app.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});

export { adapter, bot, app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = config.port;
  app.listen(port, () => {
    console.log(`\nTeams Adapter listening at http://localhost:${port}`);
    console.log('\nGet Bot Framework Emulator: https://aka.ms/botframework-emulator');
    console.log('\nTo test your bot in Teams, deploy to Azure or use ngrok.');
  });
}
