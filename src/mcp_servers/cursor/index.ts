import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { CursorClient } from "./cursor_client.js";

export class CursorServer {
  private server: McpServer;
  private client: CursorClient;
  private tasksDir: string;

  constructor() {
    this.server = new McpServer({
      name: "cursor-server",
      version: "1.0.0",
    });

    this.client = new CursorClient();
    // Use .agent/cursor_tasks to avoid cluttering root if possible, but .cursor is standard for Cursor config.
    // Let's use .cursor/tasks as planned.
    this.tasksDir = join(process.cwd(), ".cursor", "tasks");

    // Ensure directory exists
    try {
        if (!existsSync(this.tasksDir)) {
            mkdirSync(this.tasksDir, { recursive: true });
        }
    } catch (e) {
        // If run in a restricted env where creation fails, tasks might fail.
        console.error(`Failed to create tasks directory: ${e}`);
    }

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "cursor_open",
      "Open files or directories in Cursor IDE.",
      {
        paths: z.array(z.string()).describe("List of file or directory paths to open."),
        newWindow: z.boolean().optional().describe("Open in a new window.")
      },
      async ({ paths, newWindow }) => {
        // Check for CLI availability (optional, or rely on execute handling it)
        const args = [...paths];
        if (newWindow) args.push("-n");

        const result = await this.client.execute(args);
        if (result.code === 0) {
            return {
                content: [{ type: "text", text: `Successfully opened in Cursor: ${paths.join(", ")}` }]
            };
        } else {
            return {
                content: [{ type: "text", text: `Failed to open in Cursor. \nStderr: ${result.stderr}\nIs 'cursor' installed and in your PATH?` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "cursor_execute_task",
      "Create a task file and open it in Cursor for the user to execute.",
      {
        title: z.string().describe("Short title of the task."),
        description: z.string().describe("Detailed description of what needs to be done."),
        files: z.array(z.string()).optional().describe("Relevant files for context."),
        context: z.string().optional().describe("Additional context from memory/Brain.")
      },
      async ({ title, description, files, context }) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const safeTitle = title.replace(/[^a-zA-Z0-9_-]/g, "_");
        const filename = `${timestamp}_${safeTitle}.md`;
        const filepath = join(this.tasksDir, filename);

        let content = `# Task: ${title}\n\n## Description\n${description}\n`;
        if (context) content += `\n## Context\n${context}\n`;
        if (files && files.length > 0) content += `\n## Relevant Files\n${files.map(f => `- ${f}`).join("\n")}\n`;

        try {
            if (!existsSync(this.tasksDir)) mkdirSync(this.tasksDir, { recursive: true });
            writeFileSync(filepath, content, "utf-8");
        } catch (e: any) {
             return {
                content: [{ type: "text", text: `Failed to create task file: ${e.message}` }],
                isError: true
             };
        }

        // Open the project (current dir) and the task file
        // We open the task file specifically so it's focused.
        // We also pass relevant files to open them as tabs if possible.
        const filesToOpen = [filepath, ...(files || [])];

        const result = await this.client.execute(filesToOpen);

        if (result.code === 0) {
             return {
                content: [{ type: "text", text: `Task created at ${filepath} and opened in Cursor.` }]
            };
        } else {
             return {
                content: [{ type: "text", text: `Task created at ${filepath}, but failed to open Cursor.\nStderr: ${result.stderr}` }],
                isError: true
             };
        }
      }
    );

    this.server.tool(
      "cursor_edit_file",
      "Instruct Cursor (via a task file) to edit a specific file.",
      {
        file: z.string().describe("The file to edit."),
        instructions: z.string().describe("Instructions for the edit."),
        context: z.string().optional().describe("Additional context.")
      },
      async ({ file, instructions, context }) => {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const safeFile = file.replace(/[\/\\]/g, "_");
        const filename = `${timestamp}_edit_${safeFile}.md`;
        const filepath = join(this.tasksDir, filename);

        let content = `# Edit Task: ${file}\n\n## Instructions\n${instructions}\n`;
        if (context) content += `\n## Context\n${context}\n`;

        try {
            if (!existsSync(this.tasksDir)) mkdirSync(this.tasksDir, { recursive: true });
            writeFileSync(filepath, content, "utf-8");
        } catch (e: any) {
             return {
                content: [{ type: "text", text: `Failed to create task file: ${e.message}` }],
                isError: true
             };
        }

        const result = await this.client.execute([filepath, file]);
         if (result.code === 0) {
             return {
                content: [{ type: "text", text: `Edit task created at ${filepath} and opened in Cursor along with target file.` }]
            };
        } else {
             return {
                content: [{ type: "text", text: `Edit task created at ${filepath}, but failed to open Cursor.\nStderr: ${result.stderr}` }],
                isError: true
             };
        }
      }
    );

    this.server.tool(
        "cursor_generate_code",
        "Instruct Cursor (via a task file) to generate code.",
        {
            description: z.string().describe("Description of the code to generate."),
            outputFile: z.string().optional().describe("Where to save the generated code."),
            context: z.string().optional().describe("Additional context.")
        },
        async ({ description, outputFile, context }) => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const filename = `${timestamp}_generate.md`;
            const filepath = join(this.tasksDir, filename);

            let content = `# Generation Task\n\n## Description\n${description}\n`;
            if (outputFile) content += `\n## Target Output File\n${outputFile}\n`;
            if (context) content += `\n## Context\n${context}\n`;

            try {
                if (!existsSync(this.tasksDir)) mkdirSync(this.tasksDir, { recursive: true });
                writeFileSync(filepath, content, "utf-8");
            } catch (e: any) {
                 return {
                    content: [{ type: "text", text: `Failed to create task file: ${e.message}` }],
                    isError: true
                 };
            }

            const filesToOpen = [filepath];
            if (outputFile) {
                filesToOpen.push(outputFile);
            }

            const result = await this.client.execute(filesToOpen);
             if (result.code === 0) {
                 return {
                    content: [{ type: "text", text: `Generation task created at ${filepath} and opened in Cursor.` }]
                };
            } else {
                 return {
                    content: [{ type: "text", text: `Generation task created at ${filepath}, but failed to open Cursor.\nStderr: ${result.stderr}` }],
                    isError: true
                 };
            }
        }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Cursor MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CursorServer();
  server.run().catch((err) => {
    console.error("Fatal error in Cursor MCP Server:", err);
    process.exit(1);
  });
}
