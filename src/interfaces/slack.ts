import "dotenv/config";
import { App } from "@slack/bolt";
import { Engine, Context, Registry } from "../engine/orchestrator.js";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { getActiveSkill } from "../skills.js";
import { WorkflowEngine } from "../workflows/workflow_engine.js";
import { createExecuteSOPTool } from "../workflows/execute_sop_tool.js";
import { fileURLToPath } from "url";
import { persona } from "../persona.js";

// Custom Engine to capture output and stream to Slack
class SlackEngine extends Engine {
  private client: any;
  private channel: string;
  private threadTs: string;

  constructor(
    llm: any,
    registry: Registry,
    mcp: MCP,
    client: any,
    channel: string,
    threadTs: string
  ) {
    super(llm, registry, mcp);
    this.client = client;
    this.channel = channel;
    this.threadTs = threadTs;

    // Override spinner to stream updates to Slack
    this.s = {
      start: (msg: string) => this.log('info', `[Start] ${msg}`),
      stop: (msg: string) => this.log('success', `[Done] ${msg}`),
      message: (msg: string) => this.log('info', `[Update] ${msg}`),
    } as any;
  }

  // Override log to send updates to Slack thread
  protected override log(type: 'info' | 'success' | 'warn' | 'error', message: string) {
    // Filter out verbose logs (like token usage) to avoid spamming the channel
    if (message.includes("Tokens:") || message.includes("prompt +")) return;

    // Map log types to emojis for better visibility
    let icon = "";
    if (type === 'success') icon = "✅ ";
    else if (type === 'warn') icon = "⚠️ ";
    else if (type === 'error') icon = "❌ ";
    else if (type === 'info') icon = "ℹ️ ";

    // Send the log message to the thread
    // Note: In a high-volume scenario, we might want to batch these or update a single status message.
    // For now, we'll post individual messages to the thread to provide a detailed execution trace.
    this.client.chat.postMessage({
      channel: this.channel,
      thread_ts: this.threadTs, // Reply in thread
      text: `${icon} ${message}`
    }).catch((err: any) => {
      console.error("Failed to log to Slack:", err);
    });

    // Also log to console for server-side debugging
    super.log(type, message);
  }

  protected async getUserInput(initialValue: string, interactive: boolean): Promise<string | undefined> {
    // In Slack, we don't support interactive prompts mid-execution for now.
    // We treat this as a non-interactive session.
    this.log('warn', "Agent requested input, but interactive mode is disabled in Slack adapter.");
    return undefined;
  }
}

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Store pending approvals: action_id -> resolve function
const pendingApprovals = new Map<string, (value: string) => void>();

// Global instances for performance and resource management
const baseRegistry = new Registry();
const mcp = new MCP();
let isInitialized = false;

// For testing
export function resetInitialization() {
  isInitialized = false;
}

export { isInitialized };

// Initialize global resources once
async function initializeResources() {
  if (isInitialized) return;

  // Initialize Workflow Engine
  const workflowEngine = new WorkflowEngine(baseRegistry);
  const sopTool = createExecuteSOPTool(workflowEngine);
  baseRegistry.tools.set(sopTool.name, sopTool as any);

  // Register MCP tools
  await mcp.init();
  (await mcp.getTools()).forEach((t) => baseRegistry.tools.set(t.name, t as any));

  isInitialized = true;
}

// Action listener for buttons
app.action(new RegExp("approval_action_.*"), async ({ ack, body, action }: any) => {
  await ack();
  const blockAction = action as any; // Type assertion for BlockAction
  const actionId = blockAction.action_id;
  const value = blockAction.value;

  if (pendingApprovals.has(actionId)) {
    const resolve = pendingApprovals.get(actionId);
    if (resolve) {
      resolve(value);
      pendingApprovals.delete(actionId);
    }
  }
});

app.event("app_mention", async ({ event, say, client }: any) => {
  const channel = event.channel;
  const text = event.text.replace(/<@.*?>/, "").trim(); // Remove mention
  const ts = event.ts;

  try {
    // 0. Load Persona Config
    await persona.loadConfig();

    // 1. Working Hours Check
    const status = persona.getWorkingHoursStatus();
    if (!status.isWorkingHours) {
        await client.chat.postMessage({
            channel: channel,
            thread_ts: ts,
            text: `I am currently offline. I will be back at ${status.nextAvailable}.`
        });
        return;
    }

    // 2. Add emoji reaction to acknowledge receipt
    const reaction = persona.generateReaction(text) || 'thumbsup';
    try {
        await client.reactions.add({
            name: reaction,
            channel: channel,
            timestamp: ts
        });
    } catch (e) {
        // Fallback if custom emoji fails or already reacted
        if (reaction !== 'thumbsup') {
             try {
                await client.reactions.add({
                    name: 'thumbsup',
                    channel: channel,
                    timestamp: ts
                });
             } catch {}
        }
    }

    // 3. Simulate Latency
    await persona.simulateLatency();

    // 4. Implement typing indicators
    const config = persona.getConfig();
    if (config?.response_latency?.simulate_typing) {
        // Attempt requested method (might fail as it's non-standard)
        try {
          await client.chat.postMessage({
            channel: channel,
            type: 'typing', // Requested feature
            text: "Typing..." // Fallback text
          } as any);
        } catch (e) {
          // Ignore error if 'type: typing' is not supported
        }
    }

    // Also send a "Thinking..." message to start the thread/interaction
    // This serves as a robust typing/status indicator.
    await client.chat.postMessage({
      channel: channel,
      text: "Thinking...",
      thread_ts: ts // Reply to the user's message
    });

    // Ensure global resources are initialized
    if (!isInitialized) {
      await initializeResources();
    }

    // Create a request-specific registry by cloning the base registry
    const requestRegistry = new Registry();
    // Copy tools from baseRegistry
    for (const [name, tool] of baseRegistry.tools) {
      requestRegistry.tools.set(name, tool);
    }

    // Register 'ask_supervisor' specifically for this channel
    requestRegistry.tools.set("ask_supervisor", {
      name: "ask_supervisor",
      description: "Ask the supervisor (user) for approval or input via Slack buttons. Use this when you need confirmation before proceeding with critical actions.",
      execute: async (args: any) => {
        const { question, options: opts } = args;
        const choices = opts || ["Approve", "Reject"];
        const uniqueId = Math.random().toString(36).substring(7);

        // Send block kit message
        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Request for Approval:*\n${question}`
            }
          },
          {
            type: "actions",
            elements: choices.map((choice: string, idx: number) => {
              const actionId = `approval_action_${uniqueId}_${idx}`;
              return {
                type: "button",
                text: {
                  type: "plain_text",
                  text: choice
                },
                value: choice,
                action_id: actionId
              };
            })
          }
        ];

        await client.chat.postMessage({
          channel: channel,
          blocks: blocks as any,
          text: question, // Fallback
          thread_ts: ts // Keep approvals in thread
        });

        // Wait for user action
        return new Promise<string>((resolve) => {
          // Register all potential action IDs for this request
          choices.forEach((_: any, idx: number) => {
            const actionId = `approval_action_${uniqueId}_${idx}`;
            pendingApprovals.set(actionId, resolve);
          });

          // Timeout after 5 minutes
          setTimeout(() => {
            resolve("Timeout: No response received.");
            // Cleanup
            choices.forEach((_: any, idx: number) => {
              const actionId = `approval_action_${uniqueId}_${idx}`;
              pendingApprovals.delete(actionId);
            });
          }, 300000);
        });
      }
    });

    // Initialize SlackEngine with request registry and shared MCP instance
    const cwd = process.cwd();
    const provider = createLLM();
    // Use SlackEngine to capture logs and stream to thread
    const engine = new SlackEngine(provider, requestRegistry, mcp, client, channel, ts);
    const skill = await getActiveSkill(cwd);
    const ctx = new Context(cwd, skill);

    // Parse company flag
    let prompt = text;
    const companyMatch = prompt.match(/--company\s+([a-zA-Z0-9_-]+)/);
    const company = companyMatch ? companyMatch[1] : undefined;
    if (company) {
        prompt = prompt.replace(/--company\s+[a-zA-Z0-9_-]+/, "").trim();
    }

    // Run the engine (simulating CLI command)
    await engine.run(ctx, prompt, { interactive: false, company });

    // Retrieve Response
    const lastMessage = ctx.history.filter(m => m.role === "assistant").pop();

    if (lastMessage) {
      let content = lastMessage.content;
      try {
        const parsed = JSON.parse(content);
        if (parsed.message) content = parsed.message;
        else if (parsed.thought) content = parsed.thought; // Fallback
      } catch { }

      if (content) {
        // Post final response to the channel (main thread or thread reply)
        // Using `say` usually posts to channel. Let's reply in thread for consistency with logs.
        await client.chat.postMessage({
          channel: channel,
          thread_ts: ts,
          text: content
        });
      } else {
        await client.chat.postMessage({
          channel: channel,
          thread_ts: ts,
          text: "Task completed (check logs/artifacts)."
        });
      }
    } else {
      await client.chat.postMessage({
        channel: channel,
        thread_ts: ts,
        text: "I couldn't generate a response."
      });
    }

  } catch (error: any) {
    console.error("Error processing Slack event:", error);
    await client.chat.postMessage({
      channel: channel,
      thread_ts: ts,
      text: `Error: ${error.message}`
    });
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    // Initialize resources before starting
    await initializeResources();
    const port = Number(process.env.PORT) || 3000;
    await app.start(port);
    console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
  })();
}

export { app };
