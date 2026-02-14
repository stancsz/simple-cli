import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { Engine, Context, Registry } from "../../engine.js";
import { MCP } from "../../mcp.js";
import { createLLM } from "../../llm.js";
import { builtinSkills } from "../../skills.js";
import { fileURLToPath } from "url";

// Define tool schemas with Zod
const HireWorkerSchema = z.object({
  role: z
    .string()
    .describe("The role of the worker (e.g., 'researcher', 'coder')."),
  name: z.string().describe("A unique name for the worker."),
});

const DelegateTaskSchema = z.object({
  worker_name: z.string().describe("The name of the worker to delegate to."),
  task: z.string().describe("The task description."),
});

export const HIRE_WORKER_TOOL = {
  name: "hire_worker",
  description: "Hire a new worker (sub-agent) with a specific role.",
  inputSchema: {
    type: "object",
    properties: {
      role: {
        type: "string",
        description: "The role of the worker (e.g., 'researcher', 'coder').",
      },
      name: {
        type: "string",
        description: "A unique name for the worker.",
      },
    },
    required: ["role", "name"],
  },
};

export const DELEGATE_TASK_TOOL = {
  name: "delegate_task",
  description: "Delegate a task to a hired worker.",
  inputSchema: {
    type: "object",
    properties: {
      worker_name: {
        type: "string",
        description: "The name of the worker to delegate to.",
      },
      task: {
        type: "string",
        description: "The task description.",
      },
    },
    required: ["worker_name", "task"],
  },
};

export const LIST_WORKERS_TOOL = {
  name: "list_workers",
  description: "List all currently hired workers.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export class OpenCoworkServer {
  private server: Server;
  public workers: Map<string, Engine> = new Map();
  public workerContexts: Map<string, Context> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: "opencowork-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [HIRE_WORKER_TOOL, DELEGATE_TASK_TOOL, LIST_WORKERS_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  public async handleCallTool(name: string, args: any) {
    try {
      if (name === "hire_worker") {
        const parsed = HireWorkerSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
        }
        const { role, name: workerName } = parsed.data;
        return await this.hireWorker(role, workerName);
      }
      if (name === "delegate_task") {
        const parsed = DelegateTaskSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
        }
        const { worker_name, task } = parsed.data;
        return await this.delegateTask(worker_name, task);
      }
      if (name === "list_workers") {
        return await this.listWorkers();
      }
      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    } catch (e: any) {
      if (e instanceof McpError) throw e;
      return {
        content: [
          {
            type: "text",
            text: `Error: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async hireWorker(role: string, name: string) {
    if (this.workers.has(name)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Worker with name '${name}' already exists.`,
      );
    }

    console.error(`[OpenCowork] Hiring worker '${name}' as '${role}'...`);

    // Create a new Engine instance for the worker
    const llm = createLLM();
    const registry = new Registry();
    const mcp = new MCP();
    // Note: Calling mcp.init() might be needed if workers need tools.
    // For now, we assume basic LLM capabilities.

    const engine = new Engine(llm, registry, mcp);
    this.workers.set(name, engine);

    // Create a context for the worker
    // We use a default skill but customize the system prompt based on role
    const baseSkill = builtinSkills.code; // Default to code skill for now
    const skill = {
      ...baseSkill,
      name: role,
      systemPrompt: `You are a ${role} named ${name}. ${baseSkill.systemPrompt}`,
    };

    const context = new Context(process.cwd(), skill);
    this.workerContexts.set(name, context);

    return {
      content: [
        {
          type: "text",
          text: `Worker '${name}' hired as '${role}'.`,
        },
      ],
    };
  }

  async delegateTask(workerName: string, task: string) {
    const engine = this.workers.get(workerName);
    const context = this.workerContexts.get(workerName);

    if (!engine || !context) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Worker '${workerName}' not found.`,
      );
    }

    console.error(
      `[OpenCowork] Delegating task to '${workerName}': ${task.substring(0, 50)}...`,
    );

    const initialHistoryLength = context.history.length;

    try {
      await engine.run(context, task, { interactive: false });
    } catch (e: any) {
      // Ignore "interactive" errors if they occur
      console.error(`[OpenCowork] Worker error: ${e.message}`);
      return {
        content: [
          {
            type: "text",
            text: `Worker encountered an error: ${e.message}`,
          },
        ],
        isError: true,
      };
    }

    const newMessages = context.history.slice(initialHistoryLength);
    const lastMessage = newMessages[newMessages.length - 1];

    const resultText = lastMessage
      ? `Worker finished. Last message: ${lastMessage.content}`
      : "Worker finished but produced no output.";

    return {
      content: [
        {
          type: "text",
          text: resultText,
        },
      ],
    };
  }

  async listWorkers() {
    const workers = Array.from(this.workers.keys());
    return {
      content: [
        {
          type: "text",
          text: `Active workers: ${workers.join(", ") || "None"}`,
        },
      ],
    };
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
