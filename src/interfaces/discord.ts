import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Events, Message, TextChannel } from "discord.js";
import { Engine, Context, Registry } from "../engine/orchestrator.js";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { getActiveSkill } from "../skills.js";
import { WorkflowEngine } from "../workflows/workflow_engine.js";
import { createExecuteSOPTool } from "../workflows/execute_sop_tool.js";
import { fileURLToPath } from "url";
import { BaseInterface } from "./base.js";

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
  (await mcp.getTools()).forEach((t) => baseRegistry.tools.set(t.name, t as any));

  isInitialized = true;
}

export class DiscordInterface extends BaseInterface {
    constructor() {
        super();
        this.initialize().catch(console.error);
    }

    async sendRaw(content: string, metadata: { message?: Message, channel?: any }): Promise<void> {
        if (metadata.message) {
            await metadata.message.reply(content);
        } else if (metadata.channel) {
            await metadata.channel.send(content);
        }
    }
}

// Custom Engine to capture output and stream to Discord
class DiscordEngine extends Engine {
  private channel: TextChannel;
  private threadId: string | null;
  private discordInterface: DiscordInterface;

  constructor(
    llm: any,
    registry: Registry,
    mcp: MCP,
    channel: TextChannel,
    threadId: string | null = null,
    discordInterface: DiscordInterface
  ) {
    super(llm, registry, mcp);
    this.channel = channel;
    this.threadId = threadId;
    this.discordInterface = discordInterface;

    // Override spinner to stream updates to Discord
    this.s = {
      start: (msg: string) => {
        this.log('info', `[Start] ${msg}`);
        // Trigger typing via interface if possible, or direct call
        if (msg === "Typing..." || msg.startsWith("Executing")) {
          this.channel.sendTyping().catch(console.error);
        }
      },
      stop: (msg: string) => this.log('success', `[Done] ${msg}`),
      message: (msg: string) => this.log('info', `[Update] ${msg}`),
    } as any;
  }

  // Override log to send updates to Discord
  protected override log(type: 'info' | 'success' | 'warn' | 'error', message: string) {
    // Filter out verbose logs
    if (message.includes("Tokens:") || message.includes("prompt +")) return;

    let icon = "";
    if (type === 'success') icon = "✅ ";
    else if (type === 'warn') icon = "⚠️ ";
    else if (type === 'error') icon = "❌ ";
    else if (type === 'info') icon = "ℹ️ ";

    this.discordInterface.sendResponse(`${icon} ${message}`, 'log', { channel: this.channel }).catch((err) => {
      console.error("Failed to log to Discord:", err);
    });

    // Also log to console
    super.log(type, message);
  }

  protected async getUserInput(initialValue: string, interactive: boolean): Promise<string | undefined> {
    this.log('warn', "Agent requested input, but interactive mode is disabled in Discord adapter.");
    return undefined;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`⚡️ Discord bot ready! Logged in as ${c.user.tag}`);
});

const discordInterface = new DiscordInterface();

client.on(Events.MessageCreate, async (message: Message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Check for mention or DM
  const isMentioned = client.user && message.mentions.users.has(client.user.id);
  const isDM = !message.guild;

  if (!isMentioned && !isDM) return;

  // Simple Ping-Pong
  if (message.content.trim() === '!ping') {
    await message.reply('Pong!');
    return;
  }

  try {
    // 1. Acknowledge (Reaction)
    await message.react('👍');

    // 2. Typing Indicator
    await (message.channel as any).sendTyping();
    const onTyping = async () => {
        try { await (message.channel as any).sendTyping(); } catch {}
    };

    // 3. Initial "Thinking..." message
    await discordInterface.sendResponse("Thinking...", 'log', { message }, onTyping);

    // 4. Initialize Resources
    if (!isInitialized) {
      await initializeResources();
    }

    const text = message.content.replace(/<@!?[0-9]+>/, "").trim();

    // Create request-specific registry
    const requestRegistry = new Registry();
    for (const [name, tool] of baseRegistry.tools) {
      requestRegistry.tools.set(name, tool);
    }

    const cwd = process.cwd();
    const provider = createLLM();

    const engine = new DiscordEngine(provider, requestRegistry, mcp, message.channel as any, null, discordInterface);
    const skill = await getActiveSkill(cwd);
    const ctx = new Context(cwd, skill);

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
        await discordInterface.sendResponse(content, 'response', { message }, onTyping);
      } else {
        await discordInterface.sendResponse("Task completed (check logs/artifacts).", 'response', { message }, onTyping);
      }
    } else {
      await discordInterface.sendResponse("I couldn't generate a response.", 'response', { message }, onTyping);
    }

  } catch (error: any) {
    console.error("Error processing Discord message:", error);
    await message.reply(`Error: ${error.message}`);
  }
});

export const start = async () => {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    console.error("Error: DISCORD_BOT_TOKEN environment variable is not set.");
    process.exit(1);
  }
  await client.login(token);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
