import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Engine, Context, Registry } from "../../engine/orchestrator.js";
import { MCP } from "../../mcp.js";
import { createLLM } from "../../llm/index.js";
import { builtinSkills } from "../../skills.js";
import { fileURLToPath } from "url";

export class OpenCoworkServer {
  private server: McpServer;
  public workers: Map<string, any> = new Map();
  public workerContexts: Map<string, any> = new Map();

  constructor() {
    this.server = new McpServer({
      name: "opencowork-server",
      version: "1.0.0",
    });

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
  }

  async hireWorker(role: string, name: string) {
    if (this.workers.has(name)) {
      throw new Error(`Worker with name '${name}' already exists.`);
    }

    console.error(`[OpenCowork] Hiring worker '${name}' as '${role}'...`);

    const llm = createLLM();
    const mcp = new MCP();
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
