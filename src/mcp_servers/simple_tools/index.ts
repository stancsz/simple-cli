import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { ContextManager } from "../../context_manager.js";

const execAsync = promisify(exec);

export const UPDATE_CONTEXT_TOOL = {
  name: "update_context",
  description:
    "Update the shared context (goals, constraints, recent changes) for all agents.",
  inputSchema: {
    type: "object",
    properties: {
      goal: {
        type: "string",
        description: "Add a new high-level goal.",
      },
      constraint: {
        type: "string",
        description: "Add a new global constraint.",
      },
      change: {
        type: "string",
        description: "Log a recent architectural change or decision.",
      },
    },
  },
};

export const READ_CONTEXT_TOOL = {
  name: "read_context",
  description: "Read the current shared context summary.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export const READ_FILE_TOOL = {
  name: "read_file",
  description: "Read the content of a file.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path of the file to read.",
      },
    },
    required: ["path"],
  },
};

export const WRITE_FILE_TOOL = {
  name: "write_file",
  description: "Write content to a file.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path of the file to write.",
      },
      content: {
        type: "string",
        description: "The content to write.",
      },
    },
    required: ["path", "content"],
  },
};

export const RUN_COMMAND_TOOL = {
  name: "run_command",
  description: "Execute a shell command.",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The command to execute.",
      },
    },
    required: ["command"],
  },
};

export const SEARCH_MEMORY_TOOL = {
  name: "search_memory",
  description: "Search long-term memory for relevant information.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query.",
      },
    },
    required: ["query"],
  },
};

export const ADD_MEMORY_TOOL = {
  name: "add_memory",
  description: "Add a piece of information to long-term memory.",
  inputSchema: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The information to remember.",
      },
      metadata: {
        type: "string",
        description: "Optional JSON metadata string.",
      },
    },
    required: ["text"],
  },
};

export class SimpleToolsServer {
  private server: Server;
  private contextManager: ContextManager;

  constructor(contextManager?: ContextManager) {
    this.server = new Server(
      {
        name: "simple-tools-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    // Initialize ContextManager relative to process.cwd()
    this.contextManager = contextManager || new ContextManager(process.cwd());
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        UPDATE_CONTEXT_TOOL,
        READ_CONTEXT_TOOL,
        READ_FILE_TOOL,
        WRITE_FILE_TOOL,
        RUN_COMMAND_TOOL,
        SEARCH_MEMORY_TOOL,
        ADD_MEMORY_TOOL,
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  public async handleCallTool(name: string, args: any) {
    try {
      if (name === "update_context") {
        const { goal, constraint, change } = args as any;
        const updates = [];
        if (goal) {
          await this.contextManager.addGoal(goal);
          updates.push(`Added goal: ${goal}`);
        }
        if (constraint) {
          await this.contextManager.addConstraint(constraint);
          updates.push(`Added constraint: ${constraint}`);
        }
        if (change) {
          await this.contextManager.logChange(change);
          updates.push(`Logged change: ${change}`);
        }
        return {
          content: [
            {
              type: "text",
              text:
                updates.length > 0 ? updates.join("\n") : "No updates made.",
            },
          ],
        };
      }

      if (name === "read_context") {
        const summary = await this.contextManager.getContextSummary();
        return {
          content: [
            {
              type: "text",
              text: summary || "No context available.",
            },
          ],
        };
      }

      if (name === "read_file") {
        const { path } = args as any;
        if (!path) throw new Error("Path is required");
        const content = await readFile(path, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      }

      if (name === "write_file") {
        const { path, content } = args as any;
        if (!path || content === undefined)
          throw new Error("Path and content are required");
        await writeFile(path, content);
        return {
          content: [
            {
              type: "text",
              text: `Successfully wrote to ${path}`,
            },
          ],
        };
      }

      if (name === "run_command") {
        const { command } = args as any;
        if (!command) throw new Error("Command is required");
        const { stdout, stderr } = await execAsync(command);
        return {
          content: [
            {
              type: "text",
              text: stdout + (stderr ? `\nStderr: ${stderr}` : ""),
            },
          ],
        };
      }

      if (name === "search_memory") {
        const { query } = args as any;
        if (!query) throw new Error("Query is required");
        const result = await this.contextManager.searchMemory(query);
        return {
          content: [{ type: "text", text: result }],
        };
      }

      if (name === "add_memory") {
        const { text, metadata } = args as any;
        if (!text) throw new Error("Text is required");
        let meta = {};
        if (metadata) {
          try {
            meta = JSON.parse(metadata);
          } catch {
            meta = { raw: metadata };
          }
        }
        await this.contextManager.addMemory(text, meta);
        return {
          content: [{ type: "text", text: "Memory added." }],
        };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Simple Tools MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SimpleToolsServer();
  server.run().catch((err) => {
    console.error("Fatal error in Simple Tools MCP Server:", err);
    process.exit(1);
  });
}
