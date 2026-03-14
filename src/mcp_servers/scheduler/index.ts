import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import lockfile from "proper-lockfile";
import { globalBatchExecutor } from "../../batch/batch_orchestrator.js";
import { assignTaskPredictively } from "./tools/task_assignment.js";

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
        is_routine: z.boolean().optional().describe("Whether this is a routine batchable task."),
        frequency: z.enum(["hourly", "daily"]).optional().describe("Frequency of the routine task."),
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


    this.server.tool(
      "run_ecosystem_optimization",
      "Periodically called to trigger a meta-learning ecosystem optimization cycle.",
      {},
      async () => {
        try {
            // 1. Call Brain's analyze_ecosystem_patterns
            const brainSrc = join(process.cwd(), "src", "mcp_servers", "brain", "index.ts");
            const brainDist = join(process.cwd(), "dist", "mcp_servers", "brain", "index.js");
            let brainCmd = "node";
            let brainArgs = [brainDist];
            if (existsSync(brainSrc) && !existsSync(brainDist)) {
                brainCmd = "npx";
                brainArgs = ["tsx", brainSrc];
            }

            const brainTransport = new StdioClientTransport({ command: brainCmd, args: brainArgs });
            const brainClient = new Client({ name: "scheduler-brain-client", version: "1.0.0" }, { capabilities: {} });
            await brainClient.connect(brainTransport);

            let analysisResultStr = "";
            try {
                const patternsResult: any = await brainClient.callTool({
                    name: "analyze_ecosystem_patterns",
                    arguments: {}
                });
                if (patternsResult && patternsResult.content && patternsResult.content.length > 0) {
                    analysisResultStr = patternsResult.content[0].text;
                }
            } catch (e: any) {
                console.warn("Failed to get ecosystem patterns:", e.message);
            }

            // Also call propose_ecosystem_policy_update (the full pipeline)
            let policyResultStr = "";
            if (analysisResultStr) {
                try {
                    const policyResult: any = await brainClient.callTool({
                        name: "propose_ecosystem_policy_update",
                        arguments: { ecosystem_analysis: analysisResultStr }
                    });
                    if (policyResult && policyResult.content && policyResult.content.length > 0) {
                        policyResultStr = policyResult.content[0].text;
                    }
                } catch (e: any) {
                    console.warn("Failed to propose ecosystem policy update:", e.message);
                }
            }
            await brainClient.close();

            // 2. Call Agency Orchestrator's apply_ecosystem_insights
            const orchSrc = join(process.cwd(), "src", "mcp_servers", "agency_orchestrator", "index.ts");
            const orchDist = join(process.cwd(), "dist", "mcp_servers", "agency_orchestrator", "index.js");
            let orchCmd = "node";
            let orchArgs = [orchDist];
            if (existsSync(orchSrc) && !existsSync(orchDist)) {
                orchCmd = "npx";
                orchArgs = ["tsx", orchSrc];
            }

            const orchTransport = new StdioClientTransport({ command: orchCmd, args: orchArgs });
            const orchClient = new Client({ name: "scheduler-orch-client", version: "1.0.0" }, { capabilities: {} });
            await orchClient.connect(orchTransport);

            let appliedChanges = 0;
            try {
                const applyResult: any = await orchClient.callTool({
                    name: "apply_ecosystem_insights",
                    arguments: {}
                });
                if (applyResult && applyResult.content && applyResult.content.length > 0) {
                    const parsedApply = JSON.parse(applyResult.content[0].text);
                    if (parsedApply.status === "success" && parsedApply.changes) {
                        appliedChanges = parsedApply.changes.length;
                    }
                }
            } catch (e: any) {
                console.warn("Failed to apply ecosystem insights:", e.message);
            } finally {
                await orchClient.close();
            }

            // 3. Log to Health Monitor
            const healthSrc = join(process.cwd(), "src", "mcp_servers", "health_monitor", "index.ts");
            const healthDist = join(process.cwd(), "dist", "mcp_servers", "health_monitor", "index.js");
            let healthCmd = "node";
            let healthArgs = [healthDist];
            if (existsSync(healthSrc) && !existsSync(healthDist)) {
                healthCmd = "npx";
                healthArgs = ["tsx", healthSrc];
            }

            const healthTransport = new StdioClientTransport({ command: healthCmd, args: healthArgs });
            const healthClient = new Client({ name: "scheduler-health-client", version: "1.0.0" }, { capabilities: {} });
            await healthClient.connect(healthTransport);

            try {
                await healthClient.callTool({
                    name: "track_metric",
                    arguments: {
                        agent: "scheduler",
                        metric: "ecosystem_insights_applied",
                        value: appliedChanges
                    }
                });
            } catch (e: any) {
                console.warn("Failed to track metric in health monitor:", e.message);
            } finally {
                await healthClient.close();
            }

            return {
                content: [{ type: "text", text: JSON.stringify({ status: "success", appliedChanges }, null, 2) }]
            };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Error running ecosystem optimization: ${e.message}` }],
                isError: true
            };
        }
      }
    );

this.server.tool(
      "assign_task_predictively",
      "Uses ecosystem patterns from the Brain and current agency status from Agency Orchestrator to recommend the most suitable child agency for a given task.",
      {
        task_description: z.string().describe("Description of the task to be assigned."),
        priority: z.enum(["low", "normal", "high", "critical"]).optional().describe("Task priority.")
      },
      async ({ task_description, priority }) => {
        try {
          const result = await assignTaskPredictively(task_description, priority);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error assigning task predictively: ${e.message}` }],
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
