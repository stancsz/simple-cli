import "dotenv/config";
import { Client, GatewayIntentBits, Partials, Events, Message, TextChannel } from "discord.js";
import { Engine, Context, Registry } from "../engine/orchestrator.js";
import { createLLM } from "../llm/index.js";
import { MCP } from "../mcp.js";
import { getActiveSkill } from "../skills.js";
import { WorkflowEngine } from "../workflows/workflow_engine.js";
import { createExecuteSOPTool } from "../workflows/execute_sop_tool.js";
import { fileURLToPath } from "url";

// Custom Engine to capture output and stream to Discord
export class DiscordEngine extends Engine {
  private channel: TextChannel;
  private threadId: string | null;

  constructor(
    llm: any,
    registry: Registry,
    mcp: MCP,
    channel: TextChannel,
    threadId: string | null = null
  ) {
    super(llm, registry, mcp);
    this.channel = channel;
    this.threadId = threadId;

    // Override spinner to stream updates to Discord
    this.s = {
      start: (msg: string) => {
        this.log('info', `[Start] ${msg}`);
        // Trigger typing for both LLM generation ("Typing...") and Tool execution
        if (msg === "Typing..." || msg.startsWith("Executing")) {
          this.channel.sendTyping().catch(console.error);
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
          await this.channel.send(msg);
          return;
      }
      await super.run(ctx, initialPrompt, options);
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

    // In Discord, we might want to avoid spamming too many small logs.
    // For now, we'll send them.
    // Ideally we should use a dedicated log channel or thread, but here we reply in the same context.

    // Check if we are in a thread or just a channel
    // Discord.js sending logic:
    // If threadId is present (though we are passing the channel object which might be a ThreadChannel),
    // but here we typed it as TextChannel.
    // Actually, channel can be TextChannel | ThreadChannel.
    // For simplicity, let's assume 'channel' is where we send messages.

    // To prevent rate limits, we could batch, but for now direct send.
    // Also, wrap in code block if it looks like code? No, simple logs.

    // We intentionally don't await here to not block execution, but we catch errors.
    // However, if we don't await, we might lose order or hit rate limits harder.
    // Let's fire and forget for logs.
    this.channel.send(`${icon} ${message}`).catch((err) => {
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

  const text = message.content.replace(/<@!?[0-9]+>/, "").trim();

  // 0. Check Working Hours & Config
  const tempProvider = createLLM();
  const persona = tempProvider.personaEngine;
  await persona.loadConfig();

  if (!persona.isWithinWorkingHours()) {
      const oooMsg = persona.getOutOfOfficeMessage();
      await message.reply(oooMsg);
      return;
  }

  try {
    // 1. Acknowledge (Reaction)
    const reactionEmoji = persona.getReaction(text);
    await message.react(reactionEmoji);

    // 2. Typing Indicator
    await (message.channel as any).sendTyping();

    // 3. Initial "Thinking..." message
    await message.reply("Thinking...");

    // 4. Initialize Resources
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

    // We treat message.channel as the output channel.
    // In discord.js, message.channel can be TextChannel, DMChannel, ThreadChannel, etc.
    // Casting to any for the constructor to avoid complex type guarding for now,
    // as send() exists on all TextBasedChannels.
    const engine = new DiscordEngine(provider, requestRegistry, mcp, message.channel as any);
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
        await message.reply(content);
      } else {
        await message.reply("Task completed (check logs/artifacts).");
      }
    } else {
        // Check if persona prevented response
        await provider.personaEngine.loadConfig();
        if (provider.personaEngine.isWithinWorkingHours()) {
             await message.reply("I couldn't generate a response.");
        }
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
