import "dotenv/config";
import { App } from "@slack/bolt";
import { Engine, Context, Registry } from "../engine/orchestrator.js";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { getActiveSkill } from "../skills.js";
import { WorkflowEngine } from "../workflows/workflow_engine.js";
import { createExecuteSOPTool } from "../workflows/execute_sop_tool.js";
import { fileURLToPath } from "url";
import { BaseInterface } from "./base.js";

// Global instances for performance and resource management
const pendingApprovals = new Map<string, (value: string) => void>();
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

export class SlackInterface extends BaseInterface {
  public app: App;

  constructor() {
    super();
    this.app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
    });

    // Initialize persona middleware
    this.initialize().catch(console.error);

    this.setupListeners();
  }

  async sendRaw(content: string, metadata: any): Promise<void> {
    const { client, channel, thread_ts, blocks } = metadata;
    const c = client || this.app.client;

    // Support blocks if passed (e.g. for approvals), but content is usually text
    // If blocks are present, use them, but ensure text is fallback
    await c.chat.postMessage({
      channel,
      thread_ts,
      text: content,
      blocks: blocks
    });
  }

  setupListeners() {
    // Action listener for buttons
    this.app.action(new RegExp("approval_action_.*"), async ({ ack, body, action }: any) => {
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

    this.app.event("app_mention", async ({ event, say, client }: any) => {
        const channel = event.channel;
        const text = event.text.replace(/<@.*?>/, "").trim(); // Remove mention
        const ts = event.ts;

        try {
            // 1. Add emoji reaction to acknowledge receipt
            await client.reactions.add({
                name: 'thumbsup',
                channel: channel,
                timestamp: ts
            });

            // Typing callback for middleware
            const onTyping = async () => {
                try {
                     await client.chat.postMessage({
                        channel: channel,
                        type: 'typing', // Requested feature (might fail/ignored)
                        text: "Typing..." // Fallback
                      } as any).catch(() => {});
                } catch {}
            };

            // Send "Thinking..." via sendResponse (log type for simpler tone)
            await this.sendResponse("Thinking...", 'log', { client, channel, thread_ts: ts }, onTyping);

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

                    // Using sendRaw directly here because approval blocks structure is complex and shouldn't be transformed
                    // Or call sendResponse but prevent transformation?
                    // Let's use sendRaw for approval request to keep structure.
                    await this.sendRaw(question, { client, channel, thread_ts: ts, blocks });

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
            // Pass `this` (interface) to engine
            const engine = new SlackEngine(provider, requestRegistry, mcp, client, channel, ts, this);
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
                    await this.sendResponse(content, 'response', { client, channel, thread_ts: ts }, onTyping);
                } else {
                    await this.sendResponse("Task completed (check logs/artifacts).", 'response', { client, channel, thread_ts: ts }, onTyping);
                }
            } else {
                await this.sendResponse("I couldn't generate a response.", 'response', { client, channel, thread_ts: ts }, onTyping);
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
  }

  async start(port: number) {
      await this.app.start(port);
      console.log(`⚡️ Slack Bolt app is running on port ${port}!`);
  }
}

// Custom Engine to capture output and stream to Slack
class SlackEngine extends Engine {
  private client: any;
  private channel: string;
  private threadTs: string;
  private slackInterface: SlackInterface;

  constructor(
    llm: any,
    registry: Registry,
    mcp: MCP,
    client: any,
    channel: string,
    threadTs: string,
    slackInterface: SlackInterface
  ) {
    super(llm, registry, mcp);
    this.client = client;
    this.channel = channel;
    this.threadTs = threadTs;
    this.slackInterface = slackInterface;

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

    // Send the log message to the thread via interface middleware
    this.slackInterface.sendResponse(`${icon} ${message}`, 'log', {
        client: this.client,
        channel: this.channel,
        thread_ts: this.threadTs
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

const slackInterface = new SlackInterface();
const app = slackInterface.app;
export { app, slackInterface };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    // Initialize resources before starting
    await initializeResources();
    const port = Number(process.env.PORT) || 3000;
    await slackInterface.start(port);
  })();
}
