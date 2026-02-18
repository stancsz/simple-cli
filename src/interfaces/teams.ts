import "dotenv/config";
import express from "express";
import {
  ActivityHandler,
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory,
  createBotFrameworkAuthenticationFromConfiguration,
  TurnContext,
  ActivityTypes
} from "botbuilder";
import { Engine, Context, Registry } from "../engine/orchestrator.js";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { getActiveSkill } from "../skills.js";
import { WorkflowEngine } from "../workflows/workflow_engine.js";
import { createExecuteSOPTool } from "../workflows/execute_sop_tool.js";
import { fileURLToPath } from "url";
import { SopEngineServer } from "../mcp_servers/sop_engine/index.js";

// Custom Engine to capture output and stream to Teams
class TeamsEngine extends Engine {
  private context: TurnContext;

  constructor(
    llm: any,
    registry: Registry,
    mcp: MCP,
    context: TurnContext
  ) {
    super(llm, registry, mcp);
    this.context = context;

    // Override spinner
    this.s = {
      start: (msg: string) => this.log('info', `[Start] ${msg}`),
      stop: (msg: string) => this.log('success', `[Done] ${msg}`),
      message: (msg: string) => this.log('info', `[Update] ${msg}`),
    } as any;
  }

  protected override log(type: 'info' | 'success' | 'warn' | 'error', message: string) {
    if (message.includes("Tokens:") || message.includes("prompt +")) return;

    let icon = "";
    if (type === 'success') icon = "✅ ";
    else if (type === 'warn') icon = "⚠️ ";
    else if (type === 'error') icon = "❌ ";
    else if (type === 'info') icon = "ℹ️ ";

    this.context.sendActivity(`${icon} ${message}`).catch(console.error);
    super.log(type, message);
  }

  protected async getUserInput(initialValue: string, interactive: boolean): Promise<string | undefined> {
    this.log('warn', "Agent requested input, but interactive mode is disabled in Teams adapter.");
    return undefined;
  }
}

// Bot implementation
class SimpleBot extends ActivityHandler {
  private baseRegistry: Registry;
  private mcp: MCP;

  constructor(registry: Registry, mcp: MCP) {
    super();
    this.baseRegistry = registry;
    this.mcp = mcp;

    this.onMessage(async (context, next) => {
      const text = context.activity.text.trim();
      await context.sendActivity({ type: ActivityTypes.Typing });
      await context.sendActivity("Thinking...");

      try {
        const cwd = process.cwd();
        const provider = createLLM();
        const engine = new TeamsEngine(provider, this.baseRegistry, this.mcp, context);
        const skill = await getActiveSkill(cwd);
        const ctx = new Context(cwd, skill);

        await engine.run(ctx, text, { interactive: false });

        const lastMessage = ctx.history.filter(m => m.role === "assistant").pop();
        if (lastMessage) {
            let content = lastMessage.content;
            try {
                const parsed = JSON.parse(content);
                content = parsed.message || parsed.thought || content;
            } catch {}
            await context.sendActivity(content);
        } else {
            await context.sendActivity("Task completed.");
        }
      } catch (error: any) {
        console.error("Error processing Teams message:", error);
        await context.sendActivity(`Error: ${error.message}`);
      }
      await next();
    });
  }
}

// Initialization
const baseRegistry = new Registry();
const mcp = new MCP();
let isInitialized = false;

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
    } catch {}
  }
  (await mcp.getTools()).forEach((t) => baseRegistry.tools.set(t.name, t as any));
  isInitialized = true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    (async () => {
        await initializeResources();

        const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
            MicrosoftAppId: process.env.MicrosoftAppId || "",
            MicrosoftAppPassword: process.env.MicrosoftAppPassword || "",
            MicrosoftAppType: process.env.MicrosoftAppType || "MultiTenant",
            MicrosoftAppTenantId: process.env.MicrosoftAppTenantId || ""
        });

        const botFrameworkAuthentication = createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);
        const adapter = new CloudAdapter(botFrameworkAuthentication);
        const bot = new SimpleBot(baseRegistry, mcp);

        const app = express();
        app.use(express.json());

        app.post("/api/messages", async (req, res) => {
            await adapter.process(req, res, (context) => bot.run(context));
        });

        const port = process.env.PORT || 3978;
        app.listen(port, () => {
             console.log(`\nTeams Bot running on port ${port}`);
        });
    })();
}
