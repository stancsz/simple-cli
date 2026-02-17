import "dotenv/config";
import express from "express";
import {
    CloudAdapter,
    ConfigurationBotFrameworkAuthentication,
    ConfigurationServiceClientCredentialFactory,
    ActivityTypes,
    TurnContext,
    Activity
} from "botbuilder";
import { Engine, Context, Registry } from "../engine/orchestrator.js";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { getActiveSkill } from "../skills.js";
import { WorkflowEngine } from "../workflows/workflow_engine.js";
import { createExecuteSOPTool } from "../workflows/execute_sop_tool.js";
import { fileURLToPath } from "url";

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

        // Override spinner to stream updates to Teams
        this.s = {
            start: (msg: string) => {
                if (msg === "Typing...") {
                    this.context.sendActivity({ type: ActivityTypes.Typing }).catch(console.error);
                }
                this.log('info', `[Start] ${msg}`);
            },
            stop: (msg: string) => this.log('success', `[Done] ${msg}`),
            message: (msg: string) => this.log('info', `[Update] ${msg}`),
        } as any;
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

        this.context.sendActivity(`${icon} ${message}`).catch((err: any) => {
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

// Global resources
const baseRegistry = new Registry();
const mcp = new MCP();
let isInitialized = false;

async function initializeResources() {
    if (isInitialized) return;

    // Initialize Workflow Engine
    const workflowEngine = new WorkflowEngine(baseRegistry);
    const sopTool = createExecuteSOPTool(workflowEngine);
    baseRegistry.tools.set(sopTool.name, sopTool as any);

    // Register MCP tools
    await mcp.init();
    (await mcp.getTools()).forEach((t) => baseRegistry.tools.set(t.name, t as any));

    mcp.init = async () => { };
    isInitialized = true;
}

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(
    {},
    new ConfigurationServiceClientCredentialFactory({
        MicrosoftAppId: process.env.MicrosoftAppId,
        MicrosoftAppPassword: process.env.MicrosoftAppPassword,
        MicrosoftAppType: process.env.MicrosoftAppType,
        MicrosoftAppTenantId: process.env.MicrosoftAppTenantId,
    })
);

const adapter = new CloudAdapter(botFrameworkAuthentication);

const app = express();
app.use(express.json());

app.post("/api/messages", async (req, res) => {
    await adapter.process(req, res, async (context) => {
        if (context.activity.type === ActivityTypes.Message) {
            const text = context.activity.text.replace(/<at>.*?<\/at>/, "").trim();

            try {
                // 1. Acknowledge receipt (optional, but good for UX)
                // await context.sendActivity("Processing...");

                // 2. Typing indicator
                await context.sendActivity({ type: ActivityTypes.Typing });

                // Ensure global resources are initialized
                if (!isInitialized) {
                    await initializeResources();
                }

                // Create request-specific registry
                const requestRegistry = new Registry();
                for (const [name, tool] of baseRegistry.tools) {
                    requestRegistry.tools.set(name, tool);
                }

                const cwd = process.cwd();
                // createLLM() initializes the PersonaEngine internally.
                // It handles personality injection into the system prompt and
                // transforms the response (e.g., adding emojis, delays) before returning.
                const provider = createLLM();
                const engine = new TeamsEngine(provider, requestRegistry, mcp, context);
                const skill = await getActiveSkill(cwd);
                const ctx = new Context(cwd, skill);

                // Run the engine
                await engine.run(ctx, text, { interactive: false });

                // Retrieve Response
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
                    await context.sendActivity("I couldn't generate a response.");
                }

            } catch (error: any) {
                console.error("Error processing Teams activity:", error);
                await context.sendActivity(`Error: ${error.message}`);
            }
        }
    });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    (async () => {
        await initializeResources();
        const port = process.env.PORT || 3978;
        app.listen(port, () => {
            console.log(`\nSee the Teams adapter running on port ${port}`);
        });
    })();
}

export { app, adapter };
