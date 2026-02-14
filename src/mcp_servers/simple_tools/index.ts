import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { ContextManager } from "../../context_manager.js";
import { z } from "zod";

const execAsync = promisify(exec);

const UpdateContextSchema = z.object({
  goal: z.string().optional().describe("Add a new high-level goal."),
  constraint: z.string().optional().describe("Add a new global constraint."),
  change: z
    .string()
    .optional()
    .describe("Log a recent architectural change or decision."),
});

const ReadFileSchema = z.object({
  path: z.string().describe("The path of the file to read."),
});

const WriteFileSchema = z.object({
  path: z.string().describe("The path of the file to write."),
  content: z.string().describe("The content to write."),
});

const RunCommandSchema = z.object({
  command: z.string().describe("The command to execute."),
});

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

export class SimpleToolsServer {
  private server: Server;
  private contextManager: ContextManager;

  constructor() {
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
    this.contextManager = new ContextManager(process.cwd());
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
        const parsed = UpdateContextSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
        }
        const { goal, constraint, change } = parsed.data;
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
        // No input validation needed for read_context as it takes no args
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
        const parsed = ReadFileSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
        }
        const { path } = parsed.data;
        try {
          const content = await readFile(path, "utf-8");
          return {
            content: [
              {
                type: "text",
                text: content,
              },
            ],
          };
        } catch (e: any) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to read file: ${e.message}`,
          );
        }
      }

      if (name === "write_file") {
        const parsed = WriteFileSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
        }
        const { path, content } = parsed.data;
        try {
          await writeFile(path, content);
          return {
            content: [
              {
                type: "text",
                text: `Successfully wrote to ${path}`,
              },
            ],
          };
        } catch (e: any) {
          throw new McpError(
            ErrorCode.InternalError,
            `Failed to write file: ${e.message}`,
          );
        }
      }

      if (name === "run_command") {
        const parsed = RunCommandSchema.safeParse(args);
        if (!parsed.success) {
          throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
        }
        const { command } = parsed.data;
        try {
          const { stdout, stderr } = await execAsync(command);
          return {
            content: [
              {
                type: "text",
                text: stdout + (stderr ? `\nStderr: ${stderr}` : ""),
              },
            ],
          };
        } catch (e: any) {
          // Command failure is not necessarily an internal error, but we can treat it as such or return structured error content
          return {
            content: [
              {
                type: "text",
                text: `Command failed: ${e.message}\nStderr: ${e.stderr || ""}`,
              },
            ],
            isError: true,
          };
        }
      }

      throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
    } catch (error: any) {
      if (error instanceof McpError) {
        throw error;
      }
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
