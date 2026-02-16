import "dotenv/config";
import { App } from "@slack/bolt";
import { Engine, Context, Registry } from "../engine/orchestrator.js";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { getActiveSkill } from "../skills.js";
import { WorkflowEngine } from "../workflows/workflow_engine.js";
import { createExecuteSOPTool } from "../workflows/execute_sop_tool.js";
import { fileURLToPath } from "url";

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

  // Optimization: prevent re-scanning in Engine.run
  mcp.init = async () => {};

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

  try {
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
          text: question // Fallback
        });

        // Wait for user action
        return new Promise<string>((resolve) => {
          // Register all potential action IDs for this request
          choices.forEach((_: any, idx: number) => {
             const actionId = `approval_action_${uniqueId}_${idx}`;
             pendingApprovals.set(actionId, resolve);
          });

          // Timeout after 5 minutes?
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

    // Initialize Engine with request registry and shared MCP instance
    const cwd = process.cwd();
    const provider = createLLM();
    const engine = new Engine(provider, requestRegistry, mcp);
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
            else if (parsed.thought) content = parsed.thought; // Fallback
        } catch {}

        if (content) {
            await say(content);
        } else {
             await say("Task completed (check logs/artifacts).");
        }
    } else {
        await say("I couldn't generate a response.");
    }

  } catch (error: any) {
    console.error("Error processing Slack event:", error);
    await say(`Error: ${error.message}`);
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
