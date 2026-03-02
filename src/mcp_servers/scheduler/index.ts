import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import lockfile from "proper-lockfile";
import { globalBatchExecutor } from "../../scheduler/batch_executor.js";

export class SchedulerServer {
  private server: McpServer;
  private scheduleFile: string;

  constructor() {
    this.server = new McpServer({
      name: "scheduler",
      version: "1.0.0",
    });

    this.scheduleFile = process.env.JULES_AGENT_DIR
      ? join(process.env.JULES_AGENT_DIR, "scheduler.json")
      : join(process.cwd(), ".agent", "scheduler.json");

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "scheduler_list_tasks",
      "List all scheduled tasks.",
      {},
      async () => {
        try {
          if (!existsSync(this.scheduleFile)) {
             return { content: [{ type: "text", text: "No schedule file found." }] };
          }
          const content = await readFile(this.scheduleFile, "utf-8");
          const config = JSON.parse(content);
          const tasks = config.tasks || [];

          if (tasks.length === 0) {
              return { content: [{ type: "text", text: "No tasks scheduled." }] };
          }

          const text = tasks.map((t: any) =>
            `- [${t.id}] ${t.name} (${t.trigger}: ${t.schedule || t.path})`
          ).join("\n");

          return {
            content: [{ type: "text", text }]
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error listing tasks: ${e.message}` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      "scheduler_add_task",
      "Add a new task to the scheduler.",
      {
        id: z.string().describe("Unique ID for the task."),
        name: z.string().describe("Human-readable name of the task."),
        trigger: z.enum(["cron", "file-watch", "webhook"]).describe("Trigger type."),
        schedule: z.string().optional().describe("Cron expression (required for cron trigger)."),
        path: z.string().optional().describe("File path to watch (required for file-watch trigger)."),
        prompt: z.string().describe("The prompt/instruction for the task to execute."),
        yoloMode: z.boolean().optional().describe("If true, executes without confirmation."),
      },
      async (task) => {
        // Validate inputs
        if (task.trigger === 'cron' && !task.schedule) {
            return { content: [{ type: "text", text: "Error: 'schedule' is required for cron trigger." }], isError: true };
        }
        if (task.trigger === 'file-watch' && !task.path) {
            return { content: [{ type: "text", text: "Error: 'path' is required for file-watch trigger." }], isError: true };
        }

        try {
            const dir = dirname(this.scheduleFile);
            if (!existsSync(dir)) {
                await mkdir(dir, { recursive: true });
            }

            let release: (() => Promise<void>) | undefined;
            try {
                if (existsSync(this.scheduleFile)) {
                    release = await lockfile.lock(this.scheduleFile, { retries: 5 });
                }
            } catch (e) {
                // Lock failed or file issue, but we proceed to write if file doesn't exist
            }

            let config: any = { tasks: [] };
            if (existsSync(this.scheduleFile)) {
                try {
                    const content = await readFile(this.scheduleFile, "utf-8");
                    config = JSON.parse(content);
                } catch {
                    // corrupted, start fresh
                }
            }

            if (!config.tasks) config.tasks = [];

            // Check duplicate ID
            const idx = config.tasks.findIndex((t: any) => t.id === task.id);
            if (idx >= 0) {
                // Update existing
                config.tasks[idx] = task;
            } else {
                config.tasks.push(task);
            }

            await writeFile(this.scheduleFile, JSON.stringify(config, null, 2));

            if (release) await release();

            return {
                content: [{ type: "text", text: `Task '${task.name}' (${task.id}) added/updated successfully.` }]
            };

        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Error adding task: ${e.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "scheduler_run_batch",
      "Manually trigger execution of pending batched strategic tasks.",
      {},
      async () => {
        try {
            // Force processing right away bypassing the timer
            await globalBatchExecutor.forceProcess();
            return { content: [{ type: "text", text: "Batch execution triggered." }] };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Error triggering batch: ${e.message}` }],
                isError: true
            };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Scheduler MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SchedulerServer();
  server.run().catch((err) => {
    console.error("Fatal error in Scheduler MCP Server:", err);
    process.exit(1);
  });
}
