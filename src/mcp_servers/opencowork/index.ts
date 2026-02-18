import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Engine, Context, Registry } from "../../engine/orchestrator.js";
import { MCP } from "../../mcp.js";
import { createLLM } from "../../llm.js";
import { builtinSkills } from "../../skills.js";
import { fileURLToPath } from "url";
import { NegotiationManager } from "./negotiation.js";

export class OpenCoworkServer {
  private server: McpServer;
  public workers: Map<string, any> = new Map();
  public workerContexts: Map<string, any> = new Map();
  private mcp: MCP;
  private negotiation: NegotiationManager;

  constructor() {
    this.server = new McpServer({
      name: "opencowork-server",
      version: "1.0.0",
    });

    this.mcp = new MCP();
    this.negotiation = new NegotiationManager(this.mcp);

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "hire_worker",
      "Hire a new worker (sub-agent) with a specific role.",
      {
        role: z.string().describe("The role of the worker (e.g., 'researcher', 'coder')."),
        name: z.string().describe("A unique name for the worker."),
      },
      async ({ role, name }) => {
        return await this.hireWorker(role, name);
      }
    );

    this.server.tool(
      "delegate_task",
      "Delegate a task to a hired worker.",
      {
        worker_name: z.string().describe("The name of the worker to delegate to."),
        task: z.string().describe("The task description."),
      },
      async ({ worker_name, task }) => {
        return await this.delegateTask(worker_name, task);
      }
    );

    this.server.tool(
      "list_workers",
      "List all currently hired workers.",
      {},
      async () => {
        return await this.listWorkers();
      }
    );

    // Negotiation Tools
    this.server.tool(
      "bid_on_task",
      "Submit a bid for a task.",
      {
        taskId: z.string(),
        agentName: z.string(),
        proposal: z.string(),
        estimatedTime: z.string(),
        cost: z.number(),
        confidenceScore: z.number().min(0).max(1),
      },
      async (args) => {
        const result = await this.negotiation.submitBid(args);
        return {
            content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    this.server.tool(
      "evaluate_bids",
      "Evaluate bids for a task and select the best one.",
      {
        taskId: z.string()
      },
      async (args) => {
        const result = await this.negotiation.evaluateBids(args.taskId);
        if (!result) {
            return {
                content: [{ type: "text", text: "No bids found for this task." }]
            };
        }
        return {
            content: [{ type: "text", text: JSON.stringify(result) }]
        };
      }
    );

    this.server.tool(
      "form_agent_team",
      "Form a team of agents for a specific objective.",
      {
        teamName: z.string(),
        leadAgent: z.string(),
        roles: z.array(z.object({
             role: z.string(),
             requiredSkills: z.array(z.string()),
             count: z.number()
        })),
        objective: z.string()
      },
      async (args) => {
          const tree = await this.negotiation.formTeam(args);
          return {
              content: [{ type: "text", text: JSON.stringify(tree, null, 2) }]
          };
      }
    );

    this.server.tool(
        "negotiate_delegation",
        "Delegate a task to a child agent within a team tree.",
        {
            treeId: z.string(),
            parentAgent: z.string(),
            childAgent: z.string(),
            task: z.string()
        },
        async (args) => {
            const result = await this.negotiation.delegate(args.treeId, args.parentAgent, args.childAgent, args.task);
            return {
                content: [{ type: "text", text: JSON.stringify(result) }]
            };
        }
    );
  }

  async hireWorker(role: string, name: string) {
    if (this.workers.has(name)) {
      throw new Error(`Worker with name '${name}' already exists.`);
    }

    console.error(`[OpenCowork] Hiring worker '${name}' as '${role}'...`);

    const llm = createLLM();
    const mcp = new MCP();
    // We should probably init this mcp too if we want the worker to have tools
    // await mcp.init();

    const registry = new Registry();
    const engine = new Engine(llm, registry, mcp);

    this.workers.set(name, engine);

    const baseSkill = builtinSkills.code;
    const skill = {
      ...baseSkill,
      name: role,
      systemPrompt: `You are a ${role} named ${name}. ${baseSkill.systemPrompt}`,
    };

    const context = new Context(process.cwd(), skill as any);
    this.workerContexts.set(name, context);

    return {
      content: [
        {
          type: "text" as const,
          text: `Worker '${name}' hired as '${role}'.`,
        },
      ],
    } as { content: { type: "text"; text: string }[] };
  }

  async delegateTask(workerName: string, task: string) {
    const engine = this.workers.get(workerName);
    const context = this.workerContexts.get(workerName);

    if (!engine || !context) {
      throw new Error(`Worker '${workerName}' not found.`);
    }

    console.error(
      `[OpenCowork] Delegating task to '${workerName}': ${task.substring(0, 50)}...`,
    );

    const initialHistoryLength = context.history.length;

    try {
      await engine.run(context, task, { interactive: false });
    } catch (e: any) {
      console.error(`[OpenCowork] Worker error: ${e.message}`);
    }

    const newMessages = context.history.slice(initialHistoryLength);
    const lastMessage = newMessages[newMessages.length - 1];

    const resultText = lastMessage
      ? `Worker finished. Last message: ${lastMessage.content}`
      : "Worker finished but produced no output.";

    return {
      content: [
        {
          type: "text" as const,
          text: resultText,
        },
      ],
    } as { content: { type: "text"; text: string }[] };
  }

  async listWorkers() {
    const workers = Array.from(this.workers.keys());
    return {
      content: [
        {
          type: "text" as const,
          text: `Active workers: ${workers.join(", ") || "None"}`,
        },
      ],
    } as { content: { type: "text"; text: string }[] };
  }

  async run() {
    // Initialize MCP and try to connect to Brain
    await this.mcp.init();
    const servers = this.mcp.listServers();
    if (servers.find(s => s.name === 'brain')) {
        try {
            await this.mcp.startServer('brain');
            console.error("[OpenCowork] Connected to Brain MCP.");
        } catch (e) {
            console.error(`[OpenCowork] Failed to connect to Brain: ${e}`);
        }
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("OpenCowork MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new OpenCoworkServer();
  server.run().catch((err) => {
    console.error("Fatal error in OpenCowork MCP Server:", err);
    process.exit(1);
  });
}
