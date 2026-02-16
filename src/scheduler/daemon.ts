import cron from 'node-cron';
import chokidar from 'chokidar';
import { ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { readFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { ScheduleConfig, TaskDefinition } from '../daemon/task_definitions.js';
import { runTask } from './taskRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CWD = process.cwd();
const AGENT_DIR = join(CWD, '.agent');
const LOG_FILE = join(AGENT_DIR, 'daemon.log');
const MCP_CONFIG_FILE = join(CWD, 'mcp.json');
const SCHEDULER_FILE = join(AGENT_DIR, 'scheduler.json');

export class DaemonScheduler {
  private activeChildren: Set<ChildProcess> = new Set();
  private cronJobs: cron.ScheduledTask[] = [];
  private taskFileWatchers: chokidar.FSWatcher[] = [];

  constructor() {}

  private async log(msg: string) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${msg}\n`;
    try {
      if (!existsSync(AGENT_DIR)) {
        // usually exists, but just in case
      }
      await appendFile(LOG_FILE, line);
    } catch (e) {
      console.error(`Failed to write log: ${e}`);
    }
    // Also log to stdout for the daemon wrapper (if any) to capture
    console.log(line.trim());
  }

  async loadSchedule(): Promise<ScheduleConfig> {
    let tasks: TaskDefinition[] = [];

    // 1. Load from mcp.json
    if (existsSync(MCP_CONFIG_FILE)) {
        try {
            const content = await readFile(MCP_CONFIG_FILE, 'utf-8');
            const config = JSON.parse(content);

            // Support scheduler.tasks
            if (config.scheduler && config.scheduler.tasks && Array.isArray(config.scheduler.tasks)) {
                tasks.push(...config.scheduler.tasks);
            }

            // Support legacy scheduledTasks
            if (config.scheduledTasks && Array.isArray(config.scheduledTasks)) {
                // merge avoiding duplicates
                const existingIds = new Set(tasks.map(t => t.id));
                config.scheduledTasks.forEach((t: TaskDefinition) => {
                    if (!existingIds.has(t.id)) {
                        tasks.push(t);
                    }
                });
            }
        } catch (e) {
            await this.log(`Error reading mcp.json: ${e}`);
        }
    }

    // 2. Load from scheduler.json (Legacy)
    if (existsSync(SCHEDULER_FILE)) {
      try {
        const content = await readFile(SCHEDULER_FILE, 'utf-8');
        const legacyConfig = JSON.parse(content);
        if (legacyConfig.tasks && Array.isArray(legacyConfig.tasks)) {
            const existingIds = new Set(tasks.map(t => t.id));
            legacyConfig.tasks.forEach((t: TaskDefinition) => {
                if (!existingIds.has(t.id)) {
                    tasks.push(t);
                }
            });
        }
      } catch (e) {
        await this.log(`Error reading scheduler.json: ${e}`);
      }
    }

    return { tasks };
  }

  async executeTask(task: TaskDefinition) {
    await this.log(`Triggering task: ${task.name} (${task.id})`);

    try {
        const child = await runTask(task);
        this.activeChildren.add(child);

        child.stdout?.on('data', (d) => {
            const output = d.toString().trim();
            if (output) this.log(`[${task.name}] STDOUT: ${output}`);
        });

        child.stderr?.on('data', (d) => {
            const output = d.toString().trim();
            if (output) this.log(`[${task.name}] STDERR: ${output}`);
        });

        child.on('close', (code) => {
            this.activeChildren.delete(child);
            this.log(`Task ${task.name} exited with code ${code}`);
        });

        child.on('error', (err) => {
            this.activeChildren.delete(child);
            this.log(`Failed to spawn task ${task.name}: ${err.message}`);
        });
    } catch (e: any) {
        this.log(`Error running task ${task.name}: ${e.message}`);
    }
  }

  async applySchedule() {
    await this.log("Applying schedule...");

    this.cronJobs.forEach(job => job.stop());
    this.cronJobs = [];

    await Promise.all(this.taskFileWatchers.map(w => w.close()));
    this.taskFileWatchers = [];

    const config = await this.loadSchedule();
    await this.log(`Loaded ${config.tasks.length} tasks.`);

    for (const task of config.tasks) {
      try {
        if (task.trigger === 'cron' && task.schedule) {
          if (cron.validate(task.schedule)) {
            const job = cron.schedule(task.schedule, () => {
               this.log(`Cron triggered for task: ${task.name}`);
               this.executeTask(task);
            });
            this.cronJobs.push(job);
            await this.log(`Scheduled cron task: ${task.name} at "${task.schedule}"`);
          } else {
            await this.log(`Invalid cron schedule for task: ${task.name}`);
          }
        } else if (task.trigger === 'file-watch' && task.path) {
            const watchPath = join(CWD, task.path);
            const watcher = chokidar.watch(watchPath, { persistent: true, ignoreInitial: true });

            watcher.on('change', (path) => {
                this.log(`File changed: ${path}. Triggering task ${task.name}`);
                this.executeTask(task);
            });

            this.taskFileWatchers.push(watcher);
            await this.log(`Watching file: ${watchPath} for task: ${task.name}`);
        } else if (task.trigger === 'webhook') {
            await this.log(`Webhook trigger not implemented for task: ${task.name}`);
        } else {
          // ignore other triggers or improperly configured tasks
        }
      } catch (e: any) {
        await this.log(`Error scheduling task ${task.name}: ${e.message}`);
      }
    }
  }

  async start() {
    await this.log("Daemon starting...");
    await this.log(`CWD: ${CWD}`);

    await this.applySchedule();

    // Watch mcp.json for changes
    if (existsSync(MCP_CONFIG_FILE)) {
        const mcpWatcher = chokidar.watch(MCP_CONFIG_FILE, { persistent: true, ignoreInitial: true });
        mcpWatcher.on('change', async () => {
            await this.log("mcp.json changed. Reloading schedule...");
            await this.applySchedule();
        });
        this.taskFileWatchers.push(mcpWatcher);
    } else {
        const dirWatcher = chokidar.watch(CWD, { depth: 0, persistent: true, ignoreInitial: true });
        dirWatcher.on('add', async (path) => {
            if (path === MCP_CONFIG_FILE) {
                 await this.log("mcp.json created. Loading schedule...");
                 await this.applySchedule();
            }
        });
        this.taskFileWatchers.push(dirWatcher);
    }

    // Watch scheduler.json as well
    if (existsSync(SCHEDULER_FILE)) {
        const legacyWatcher = chokidar.watch(SCHEDULER_FILE, { persistent: true, ignoreInitial: true });
        legacyWatcher.on('change', async () => {
            await this.log("scheduler.json changed. Reloading schedule...");
            await this.applySchedule();
        });
        this.taskFileWatchers.push(legacyWatcher);
    }

    setInterval(() => {}, 1000 * 60 * 60); // Keep alive
  }

  async stop(signal: string) {
    await this.log(`Daemon stopping (${signal})...`);
    if (this.activeChildren.size > 0) {
        await this.log(`Killing ${this.activeChildren.size} active tasks...`);
        for (const child of this.activeChildren) {
            try {
                child.kill('SIGTERM');
            } catch (e) { }
        }
    }
    process.exit(0);
  }
}

// Script Entry Point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const daemon = new DaemonScheduler();

    process.on('SIGINT', () => daemon.stop('SIGINT'));
    process.on('SIGTERM', () => daemon.stop('SIGTERM'));

    daemon.start().catch(err => console.error(`Daemon fatal error: ${err}`));
}
