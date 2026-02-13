import { spawn, execFile, ChildProcess } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { Scheduler } from "./scheduler.js";
import { AsyncTaskManager } from "./async_tasks.js";
import { loadConfig } from "./config.js";
import { claw } from "./claw/tool.js";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

const execFileAsync = promisify(execFile);
const activeProcesses: ChildProcess[] = [];

export const cleanupProcesses = () => {
  for (const proc of activeProcesses) {
    if (!proc.killed && proc.pid) {
      if (process.platform === "win32") {
        try {
          // execSync(`taskkill /F /T /PID ${proc.pid}`);
        } catch {
          proc.kill("SIGTERM");
        }
      } else {
        proc.kill("SIGTERM");
      }
    }
  }
};

// Handle cleanup on exit
process.on("exit", cleanupProcesses);
process.on("SIGINT", () => {
  cleanupProcesses();
  process.exit();
});
process.on("SIGTERM", () => {
  cleanupProcesses();
  process.exit();
});

// Helper function to validate path is within allowed workspace
// Per user request "full power", we disable this restriction.
const isPathAllowed = (p: string): boolean => {
  return true;
};

export const change_dir = {
  name: "change_dir",
  description: "Change the current working directory",
  inputSchema: z.object({ path: z.string() }),
  execute: async ({ path }: { path: string }) => {
    try {
      process.chdir(path);
      return `Changed directory to ${process.cwd()}`;
    } catch (e: any) {
      return `Error changing directory: ${e.message}`;
    }
  },
};

// --- Meta-Orchestrator Tools ---
export const delegate_cli = {
  name: "delegate_cli",
  description:
    "Delegate a task to a specialized external CLI agent (e.g., deepseek_claude, openai_codex).",
  inputSchema: z.object({
    cli: z
      .string()
      .describe(
        "The agent to use. Default: 'deepseek_claude'. Fallback: 'openai_codex'.",
      ),
    task: z.string(),
    context_files: z.array(z.string()).optional(),
    async: z
      .boolean()
      .default(false)
      .describe("Run in background mode. Returns a Task ID to monitor."),
  }),
  execute: async ({
    cli,
    task,
    context_files,
    async,
  }: {
    cli: string;
    task: string;
    context_files?: string[];
    async: boolean;
  }) => {
    try {
      console.log(`[delegate_cli] Spawning external process for ${cli}...`);
      const config = await loadConfig();

      // Default to mock if no config for this agent
      let agent = config.agents?.[cli];
      if (!agent) {
        if (cli === "test-agent" || process.env.NODE_ENV === "test") {
          agent = {
            command: "echo",
            args: ["mock_cli.ts"],
            description: "Mock Agent",
            supports_stdin: false,
          };
        } else {
          return `[delegate_cli] Error: Agent '${cli}' not found in configuration. Available agents: ${Object.keys(config.agents || {}).join(", ")}`;
        }
      }
      const cmdArgs = [...(agent.args || []), task];

      // Handle file arguments for agents that don't support stdin or use --file flags
      if (!agent.supports_stdin && context_files && context_files.length > 0) {
        for (const file of context_files) {
          if (!isPathAllowed(file)) {
            console.warn(`[delegate_cli] Skipped restricted file: ${file}`);
            continue;
          }
          const flag =
            agent.context_flag !== undefined ? agent.context_flag : "--file";
          if (flag) {
            cmdArgs.push(flag, file);
          } else {
            cmdArgs.push(file);
          }
        }
      }

      const child = spawn(agent.command, cmdArgs, {
        env: { ...process.env, ...agent.env },
        shell: false,
      });

      // Async Mode Handling
      if (async) {
        child.kill();
        const taskManager = AsyncTaskManager.getInstance();

        if (agent.supports_stdin && context_files && context_files.length > 0) {
          return `[delegate_cli] Warning: Async mode with Stdin context is not fully supported yet. Please use 'async: false' or ensure agent accepts files via arguments.`;
        }

        const id = await taskManager.startTask(
          agent.command,
          cmdArgs,
          agent.env,
        );
        return `[delegate_cli] Async Task Started.\nID: ${id}\nMonitor status using 'check_task_status'.`;
      }

      // Sync Mode (Existing Logic)
      // Handle Stdin Context Injection
      if (agent.supports_stdin && context_files && context_files.length > 0) {
        let context = "";
        for (const file of context_files) {
          if (!isPathAllowed(file)) {
            console.warn(`[delegate_cli] Skipped restricted file: ${file}`);
            continue;
          }
          if (existsSync(file)) {
            const content = await readFile(file, "utf-8");
            context += `--- ${file} ---\n${content}\n\n`;
          }
        }
        child.stdin.write(context);
        child.stdin.end();
      } else {
        child.stdin.end();
      }

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));

      return new Promise((resolve, reject) => {
        child.on("close", (code) => {
          // if (stderr) console.warn(`[delegate_cli] Stderr: ${stderr}`);
          if (code === 0) {
            resolve(`[${cli} CLI]:\n${stdout.trim()}`);
          } else {
            resolve(
              `[${cli} CLI] Process exited with code ${code}.\nOutput: ${stdout}\nError: ${stderr}`,
            );
          }
        });
        child.on("error", (err) => {
          resolve(`[${cli} CLI] Failed to start process: ${err.message}`);
        });
      });
    } catch (e: any) {
      return `[${cli} CLI]: Error executing external process: ${e.message}`;
    }
  },
};

export const schedule_task = {
  name: "schedule_task",
  description:
    "Register a recurring task to be executed by the agent autonomously.",
  inputSchema: z.object({
    cron: z.string().describe('Standard cron expression (e.g. "0 9 * * *")'),
    prompt: z.string().describe("The instruction to execute"),
    description: z.string().describe("Human-readable description"),
  }),
  execute: async ({
    cron,
    prompt,
    description,
  }: {
    cron: string;
    prompt: string;
    description: string;
  }) => {
    try {
      const scheduler = Scheduler.getInstance();
      const id = await scheduler.scheduleTask(cron, prompt, description);
      return `Task scheduled successfully with ID: ${id}`;
    } catch (e: any) {
      return `Failed to schedule task: ${e.message}`;
    }
  },
};

export const check_task_status = {
  name: "check_task_status",
  description: "Check the status and logs of a background task.",
  inputSchema: z.object({
    id: z.string().describe("The Task ID returned by delegate_cli"),
  }),
  execute: async ({ id }: { id: string }) => {
    try {
      const manager = AsyncTaskManager.getInstance();
      const task = await manager.getTaskStatus(id);
      const logs = await manager.getTaskLogs(id, 5); // Last 5 lines

      return `Task ID: ${task.id}
Status: ${task.status}
PID: ${task.pid}
Last Logs:
${logs}
`;
    } catch (e: any) {
      return `Error checking task ${id}: ${e.message}`;
    }
  },
};

export const list_bg_tasks = {
  name: "list_bg_tasks",
  description: "List all background tasks.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      const manager = AsyncTaskManager.getInstance();
      const tasks = await manager.listTasks();
      if (tasks.length === 0) return "No background tasks found.";

      return tasks
        .map(
          (t) =>
            `- [${t.status.toUpperCase()}] ${t.id}: ${t.command} (Started: ${new Date(t.startTime).toISOString()})`,
        )
        .join("\n");
    } catch (e: any) {
      return `Error listing tasks: ${e.message}`;
    }
  },
};

export const allBuiltins = [
  delegate_cli,
  schedule_task,
  check_task_status,
  list_bg_tasks,
  change_dir,
  claw,
];
