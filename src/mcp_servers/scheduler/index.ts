import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { spawn, ChildProcess } from "child_process";
import cron from "node-cron";
import chokidar from "chokidar";
import { TaskDefinition, ScheduleConfig } from "../../interfaces/daemon.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isTs = __filename.endsWith('.ts');
const ext = isTs ? '.ts' : '.js';

// Constants
const CWD = process.cwd();
const AGENT_DIR = join(CWD, '.agent');
const MCP_CONFIG_FILE = join(CWD, 'mcp.json');
const SCHEDULER_FILE = join(AGENT_DIR, 'scheduler.json');

export class SchedulerServer {
  private server: McpServer;
  private pendingTasks: TaskDefinition[] = [];
  private activeChildren = new Set<ChildProcess>();
  private cronJobs: any[] = [];
  private taskFileWatchers: any[] = [];
  private mcpWatcher: any;
  private schedulerWatcher: any;

  constructor() {
    this.server = new McpServer({
      name: "scheduler",
      version: "1.0.0",
    });

    this.setupTools();
    this.setupSchedule(); // Start monitoring
  }

  private setupTools() {
    this.server.tool(
      "execute_scheduled_tasks",
      "Checks for due tasks and executes them. Returns a summary of started tasks.",
      {
        limit: z.number().optional().default(10).describe("Maximum number of tasks to start at once.")
      },
      async (args) => this.executeScheduledTasks(args)
    );
  }

  private async executeScheduledTasks({ limit = 10 }: { limit?: number }) {
    if (this.pendingTasks.length === 0) {
      return { content: [{ type: "text" as const, text: "No tasks due." }] };
    }

    const tasksToRun = this.pendingTasks.splice(0, limit);
    const started: string[] = [];

    for (const task of tasksToRun) {
        this.runTask(task);
        started.push(`${task.name} (${task.id})`);
    }

    return {
      content: [{ type: "text" as const, text: `Started ${started.length} tasks:\n${started.map(s => `- ${s}`).join('\n')}` }]
    };
  }

  private runTask(task: TaskDefinition) {
    console.error(`[Scheduler] Triggering task: ${task.name} (${task.id})`);

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      JULES_TASK_DEF: JSON.stringify(task)
    };

    if (task.company) {
      env.JULES_COMPANY = task.company;
    }

    // Path to executor script: src/scheduler/executor.ts
    // We are in src/mcp_servers/scheduler/
    const executorScript = join(__dirname, '..', '..', 'scheduler', `executor${ext}`);

    const args = isTs
         ? ['--loader', 'ts-node/esm', executorScript]
         : [executorScript];

    const child = spawn('node', args, {
      env,
      cwd: CWD,
      stdio: 'pipe'
    });

    this.activeChildren.add(child);

    child.stdout?.on('data', (d) => {
      const output = d.toString().trim();
      // We can log to stderr so it shows up in Daemon logs (if daemon pipes stderr)
      if (output) console.error(`[${task.name}] STDOUT: ${output}`);
    });

    child.stderr?.on('data', (d) => {
      const output = d.toString().trim();
      if (output) console.error(`[${task.name}] STDERR: ${output}`);
    });

    child.on('close', (code) => {
      this.activeChildren.delete(child);
      console.error(`[Scheduler] Task ${task.name} exited with code ${code}`);
    });

    child.on('error', (err) => {
      this.activeChildren.delete(child);
      console.error(`[Scheduler] Failed to spawn task ${task.name}: ${err.message}`);
    });
  }

  private async loadSchedule(): Promise<ScheduleConfig> {
    let tasks: TaskDefinition[] = [];

    // 1. Load from mcp.json (Primary)
    if (existsSync(MCP_CONFIG_FILE)) {
        try {
            const content = await readFile(MCP_CONFIG_FILE, 'utf-8');
            const config = JSON.parse(content);
            if (config.scheduledTasks && Array.isArray(config.scheduledTasks)) {
                tasks.push(...config.scheduledTasks);
            }
        } catch (e) {
            console.error(`[Scheduler] Error reading mcp.json: ${e}`);
        }
    }

    // 2. Load from scheduler.json (Legacy/Fallback)
    if (existsSync(SCHEDULER_FILE)) {
      try {
        const content = await readFile(SCHEDULER_FILE, 'utf-8');
        const legacyConfig = JSON.parse(content);
        if (legacyConfig.tasks && Array.isArray(legacyConfig.tasks)) {
            // Avoid duplicates by ID
            const existingIds = new Set(tasks.map(t => t.id));
            legacyConfig.tasks.forEach((t: TaskDefinition) => {
                if (!existingIds.has(t.id)) {
                    tasks.push(t);
                }
            });
        }
      } catch (e) {
        console.error(`[Scheduler] Error reading scheduler.json: ${e}`);
      }
    }

    return { tasks };
  }

  private async setupSchedule() {
    await this.applySchedule();

    // Watch mcp.json
    if (existsSync(MCP_CONFIG_FILE)) {
        this.mcpWatcher = chokidar.watch(MCP_CONFIG_FILE, { persistent: true, ignoreInitial: true });
        this.mcpWatcher.on('change', async () => {
            console.error("[Scheduler] mcp.json changed. Reloading schedule...");
            await this.applySchedule();
        });
    }

    // Watch scheduler.json
    if (existsSync(SCHEDULER_FILE)) {
        this.schedulerWatcher = chokidar.watch(SCHEDULER_FILE, { persistent: true, ignoreInitial: true });
        this.schedulerWatcher.on('change', async () => {
            console.error("[Scheduler] scheduler.json changed. Reloading schedule...");
            await this.applySchedule();
        });
    }
  }

  private async applySchedule() {
    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];
    await Promise.all(this.taskFileWatchers.map(w => w.close()));
    this.taskFileWatchers = [];

    const config = await this.loadSchedule();
    console.error(`[Scheduler] Loaded ${config.tasks.length} tasks.`);

    for (const task of config.tasks) {
      try {
        if (task.trigger === 'cron' && task.schedule) {
          if (cron.validate(task.schedule)) {
            const job = cron.schedule(task.schedule, () => {
               console.error(`[Scheduler] Cron triggered for task: ${task.name}`);
               this.pendingTasks.push(task);
            });
            this.cronJobs.push(job);
            console.error(`[Scheduler] Scheduled cron task: ${task.name} at "${task.schedule}"`);
          } else {
            console.error(`[Scheduler] Invalid cron schedule for task: ${task.name}`);
          }
        } else if (task.trigger === 'file-watch' && task.path) {
            const watchPath = join(CWD, task.path);
            const watcher = chokidar.watch(watchPath, { persistent: true, ignoreInitial: true });

            watcher.on('change', (path) => {
                console.error(`[Scheduler] File changed: ${path}. Triggering task ${task.name}`);
                this.pendingTasks.push(task);
            });

            this.taskFileWatchers.push(watcher);
            console.error(`[Scheduler] Watching file: ${watchPath} for task: ${task.name}`);
        } else {
          // ignore webhook or unknown
        }
      } catch (e: any) {
        console.error(`[Scheduler] Error scheduling task ${task.name}: ${e.message}`);
      }
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Scheduler MCP Server running on stdio");
  }

  async shutdown() {
    console.error("[Scheduler] Shutting down...");
    this.cronJobs.forEach(job => job.stop());
    await Promise.all(this.taskFileWatchers.map(w => w.close()));
    if (this.mcpWatcher) await this.mcpWatcher.close();
    if (this.schedulerWatcher) await this.schedulerWatcher.close();

    if (this.activeChildren.size > 0) {
        console.error(`[Scheduler] Killing ${this.activeChildren.size} active tasks...`);
        for (const child of this.activeChildren) {
            try {
                child.kill('SIGTERM');
            } catch (e) { }
        }
    }
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SchedulerServer();
  server.run().catch((err) => {
    console.error("Fatal error in Scheduler MCP Server:", err);
    process.exit(1);
  });

  // Handle cleanup
  const cleanup = async () => {
      await server.shutdown();
      process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
