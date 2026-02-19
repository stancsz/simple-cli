import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { WindsurfClient } from "./windsurf_client.js";
import { MCP } from "../../mcp.js";

export class WindsurfServer {
  private server: McpServer;
  private client: WindsurfClient;
  private mcp: MCP;
  private tasksDir: string;

  constructor() {
    this.server = new McpServer({
      name: "windsurf-server",
      version: "1.0.0",
    });

    this.client = new WindsurfClient();
    this.mcp = new MCP();
    this.tasksDir = join(process.cwd(), ".windsurf", "tasks");

    // Ensure directory exists
    try {
        if (!existsSync(this.tasksDir)) {
            mkdirSync(this.tasksDir, { recursive: true });
        }
    } catch (e) {
        console.error(`Failed to create tasks directory: ${e}`);
    }

    this.setupTools();
  }

  private async logToBrain(taskId: string, request: string, outcome: string, summary: string, artifacts: string[] = []) {
      try {
          await this.mcp.init();
          const tools = await this.mcp.getTools();
          const logExp = tools.find(t => t.name === 'log_experience');

          if (logExp) {
              await logExp.execute({
                  taskId: taskId,
                  task_type: 'windsurf_collaboration',
                  agent_used: 'windsurf_server',
                  outcome: outcome,
                  summary: summary,
                  artifacts: JSON.stringify(artifacts)
              });
          }
      } catch (e: any) {
          // Silent failure if Brain is not reachable, just log to stderr
          console.error(`Failed to log to Brain: ${e.message}`);
      }
  }

  private setupTools() {
    this.server.tool(
      "windsurf_create_session",
      "Create a new collaborative coding session.",
      {
        projectPath: z.string().describe("Path to the project to open."),
        collaborators: z.array(z.string()).optional().describe("List of emails/IDs to invite.")
      },
      async ({ projectPath, collaborators }) => {
        const args = ["--new-session", projectPath];
        if (collaborators && collaborators.length > 0) {
            args.push("--invite", ...collaborators);
        }

        const result = await this.client.execute(args);
        const taskId = `windsurf-session-${Date.now()}`;

        if (result.code === 0) {
            await this.logToBrain(taskId, `Create session for ${projectPath}`, "success", "Session created successfully.");
            return {
                content: [{ type: "text", text: `Successfully created Windsurf session for ${projectPath}.` }]
            };
        } else {
            await this.logToBrain(taskId, `Create session for ${projectPath}`, "failure", `Failed: ${result.stderr}`);
            return {
                content: [{ type: "text", text: `Failed to create session.\nStderr: ${result.stderr}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "windsurf_join_session",
      "Join an existing collaborative session.",
      {
        sessionId: z.string().describe("The ID of the session to join.")
      },
      async ({ sessionId }) => {
        const result = await this.client.execute(["--join-session", sessionId]);

        if (result.code === 0) {
            return {
                content: [{ type: "text", text: `Successfully joined session ${sessionId}.` }]
            };
        } else {
             return {
                content: [{ type: "text", text: `Failed to join session.\nStderr: ${result.stderr}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "windsurf_edit_code",
      "Edit code in a file using Windsurf.",
      {
        filePath: z.string().describe("The file to edit."),
        instruction: z.string().describe("Instructions for the edit."),
        context: z.string().optional().describe("Additional context.")
      },
      async ({ filePath, instruction, context }) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const safeFile = filePath.replace(/[\/\\]/g, "_");
        const filename = `${timestamp}_edit_${safeFile}.md`;
        const taskPath = join(this.tasksDir, filename);

        let content = `# Edit Task: ${filePath}\n\n## Instructions\n${instruction}\n`;
        if (context) content += `\n## Context\n${context}\n`;

        try {
            if (!existsSync(this.tasksDir)) mkdirSync(this.tasksDir, { recursive: true });
            writeFileSync(taskPath, content, "utf-8");
        } catch (e: any) {
             return {
                content: [{ type: "text", text: `Failed to create task file: ${e.message}` }],
                isError: true
             };
        }

        const result = await this.client.execute([taskPath, filePath]);
        const taskId = `windsurf-edit-${timestamp}`;

        if (result.code === 0) {
             await this.logToBrain(taskId, `Edit ${filePath}: ${instruction}`, "success", "Edit task opened in Windsurf.", [filePath]);
             return {
                content: [{ type: "text", text: `Edit task created at ${taskPath} and opened in Windsurf.` }]
            };
        } else {
             await this.logToBrain(taskId, `Edit ${filePath}: ${instruction}`, "failure", `Failed: ${result.stderr}`);
             return {
                content: [{ type: "text", text: `Edit task created but failed to open Windsurf.\nStderr: ${result.stderr}` }],
                isError: true
             };
        }
      }
    );

    this.server.tool(
      "windsurf_get_feedback",
      "Get feedback on recent code changes from the collaborative session.",
      {
        filePath: z.string().optional().describe("Specific file to check for feedback.")
      },
      async ({ filePath }) => {
        const args = ["--get-feedback"];
        if (filePath) args.push(filePath);

        const result = await this.client.execute(args);
        const taskId = `windsurf-feedback-${Date.now()}`;

        if (result.code === 0) {
            // Mock feedback parsing if stdout is empty/simulated
            const feedback = result.stdout || "No specific feedback found.";
            await this.logToBrain(taskId, `Get feedback for ${filePath || "project"}`, "success", feedback);
            return {
                content: [{ type: "text", text: feedback }]
            };
        } else {
             return {
                content: [{ type: "text", text: `Failed to get feedback.\nStderr: ${result.stderr}` }],
                isError: true
            };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Windsurf MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new WindsurfServer();
  server.run().catch((err) => {
    console.error("Fatal error in Windsurf MCP Server:", err);
    process.exit(1);
  });
}
