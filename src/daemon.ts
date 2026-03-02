import cron from 'node-cron';
import chokidar from 'chokidar';
import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { readFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { ScheduleConfig, TaskDefinition } from './interfaces/daemon.js';
import { DEFAULT_TASKS } from './scheduler/config.js';
import { PromptBatcher } from './llm/batching.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isTs = __filename.endsWith('.ts');
const ext = isTs ? '.ts' : '.js';

const CWD = process.cwd();
const AGENT_DIR = join(CWD, '.agent');
const LOG_FILE = join(AGENT_DIR, 'daemon.log'); // Changed from ghost.log
const MCP_CONFIG_FILE = join(CWD, 'mcp.json');
const SCHEDULER_FILE = join(AGENT_DIR, 'scheduler.json'); // Legacy support

// State tracking
const activeChildren = new Set<ChildProcess>();
const cronJobs: any[] = [];
const taskFileWatchers: any[] = [];

async function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  try {
    if (!existsSync(AGENT_DIR)) {
      // Create .agent dir if not exists (though usually it should)
    }
    await appendFile(LOG_FILE, line);
  } catch (e) {
    console.error(`Failed to write log: ${e}`);
  }
  console.log(line.trim());
}

export async function loadSchedule(): Promise<ScheduleConfig> {
  // Initialize with defaults
  let tasks: TaskDefinition[] = [...DEFAULT_TASKS];

  // Helper to merge tasks (override by ID)
  const mergeTasks = (newTasks: TaskDefinition[]) => {
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      for (const t of newTasks) {
          taskMap.set(t.id, t);
      }
      tasks = Array.from(taskMap.values());
  };

  // 1. Load from mcp.json (Primary)
  if (existsSync(MCP_CONFIG_FILE)) {
      try {
          const content = await readFile(MCP_CONFIG_FILE, 'utf-8');
          const config = JSON.parse(content);
          if (config.scheduledTasks && Array.isArray(config.scheduledTasks)) {
              mergeTasks(config.scheduledTasks);
          }
      } catch (e) {
          await log(`Error reading mcp.json: ${e}`);
      }
  }

  // 2. Load from scheduler.json (Legacy/Fallback)
  if (existsSync(SCHEDULER_FILE)) {
    try {
      const content = await readFile(SCHEDULER_FILE, 'utf-8');
      const legacyConfig = JSON.parse(content);
      if (legacyConfig.tasks && Array.isArray(legacyConfig.tasks)) {
          // Legacy behavior: also merge, avoiding duplicates if already overridden by mcp.json?
          // Let's assume scheduler.json is secondary to mcp.json, but might override defaults if not in mcp.json
          // My simple merge logic allows scheduler.json to override mcp.json if loaded second.
          // I should load scheduler.json first? Or keep mcp.json as primary.
          // The previous code loaded mcp.json THEN scheduler.json, but checked existingIds.
          // "Avoid duplicates by ID" -> implies NO override if already present.

          const existingIds = new Set(tasks.map(t => t.id));
          legacyConfig.tasks.forEach((t: TaskDefinition) => {
              if (!existingIds.has(t.id)) {
                  tasks.push(t);
              }
          });
      }
    } catch (e) {
      await log(`Error reading scheduler.json: ${e}`);
    }
  }

  return { tasks };
}

async function runTask(task: TaskDefinition) {
  await log(`Triggering task: ${task.name} (${task.id})`);

  if (task.batchingGroup && !task.action && task.prompt) {
    await log(`[Batcher] Queuing task ${task.id} into group: ${task.batchingGroup}`);
    try {
      const response = await PromptBatcher.getInstance().scheduleBatch(task.batchingGroup, task);
      await log(`[Batcher] Task ${task.id} completed. Response: ${response.substring(0, 100)}...`);
    } catch (e: any) {
      await log(`[Batcher] Task ${task.id} failed: ${e.message}`);
    }
    return;
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JULES_TASK_DEF: JSON.stringify(task)
  };

  if (task.company) {
    env.JULES_COMPANY = task.company;
  }

  // Point to the new executor in src/scheduler/
  const executorScript = join(__dirname, 'scheduler', `executor${ext}`);

  const args = isTs
       ? ['--loader', 'ts-node/esm', executorScript]
       : [executorScript];

  const child = spawn('node', args, {
    env,
    cwd: CWD,
    stdio: 'pipe'
  });

  activeChildren.add(child);

  child.stdout?.on('data', (d) => {
    const output = d.toString().trim();
    if (output) log(`[${task.name}] STDOUT: ${output}`);
  });

  child.stderr?.on('data', (d) => {
    const output = d.toString().trim();
    if (output) log(`[${task.name}] STDERR: ${output}`);
  });

  child.on('close', (code) => {
    activeChildren.delete(child);
    log(`Task ${task.name} exited with code ${code}`);
  });

  child.on('error', (err) => {
    activeChildren.delete(child);
    log(`Failed to spawn task ${task.name}: ${err.message}`);
  });
}

async function applySchedule() {
  await log("Applying schedule...");

  cronJobs.forEach(job => job.stop());
  cronJobs.length = 0;

  await Promise.all(taskFileWatchers.map(w => w.close()));
  taskFileWatchers.length = 0;

  const config = await loadSchedule();
  await log(`Loaded ${config.tasks.length} tasks.`);

  if (config.tasks.length === 0) {
    await log("No tasks scheduled.");
  }

  for (const task of config.tasks) {
    try {
      if (task.trigger === 'cron' && task.schedule) {
        if (cron.validate(task.schedule)) {
          const job = cron.schedule(task.schedule, () => {
             log(`Cron triggered for task: ${task.name}`);
             runTask(task);
          });
          cronJobs.push(job);
          await log(`Scheduled cron task: ${task.name} at "${task.schedule}"`);
        } else {
          await log(`Invalid cron schedule for task: ${task.name}`);
        }
      } else if (task.trigger === 'file-watch' && task.path) {
          const watchPath = join(CWD, task.path);
          const watcher = chokidar.watch(watchPath, { persistent: true, ignoreInitial: true });

          watcher.on('change', (path) => {
              log(`File changed: ${path}. Triggering task ${task.name}`);
              runTask(task);
          });

          taskFileWatchers.push(watcher);
          await log(`Watching file: ${watchPath} for task: ${task.name}`);
      } else if (task.trigger === 'webhook') {
          await log(`Webhook trigger not implemented for task: ${task.name}`);
      } else {
        await log(`Unknown trigger or missing config for task: ${task.name}`);
      }
    } catch (e: any) {
      await log(`Error scheduling task ${task.name}: ${e.message}`);
    }
  }
}

async function main() {
  await log("Daemon starting...");
  await log(`CWD: ${CWD}`);

  await applySchedule();

  // Watch mcp.json for changes
  if (existsSync(MCP_CONFIG_FILE)) {
      const mcpWatcher = chokidar.watch(MCP_CONFIG_FILE, { persistent: true, ignoreInitial: true });
      mcpWatcher.on('change', async () => {
          await log("mcp.json changed. Reloading schedule...");
          await applySchedule();
      });
  } else {
      // Watch cwd for creation of mcp.json
      const dirWatcher = chokidar.watch(CWD, { depth: 0, persistent: true, ignoreInitial: true });
      dirWatcher.on('add', async (path) => {
          if (path === MCP_CONFIG_FILE) {
               await log("mcp.json created. Loading schedule...");
               await applySchedule();
               // Could attach specific watcher now, but applySchedule re-runs so logic is fine
               // We might want to restart to attach specific watcher properly or just rely on manual restart
               // For now, reloading schedule is good enough.
          }
      });
  }

  // Watch scheduler.json as well
  if (existsSync(SCHEDULER_FILE)) {
      const legacyWatcher = chokidar.watch(SCHEDULER_FILE, { persistent: true, ignoreInitial: true });
      legacyWatcher.on('change', async () => {
          await log("scheduler.json changed. Reloading schedule...");
          await applySchedule();
      });
  }

  // Start Health Check Server
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    const server = createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(port, () => {
      log(`Health check server running on port ${port}`);
    });
  }

  setInterval(() => {}, 1000 * 60 * 60); // Keep alive
}

const shutdown = async (signal: string) => {
    await log(`Daemon stopping (${signal})...`);
    if (activeChildren.size > 0) {
        await log(`Killing ${activeChildren.size} active tasks...`);
        for (const child of activeChildren) {
            try {
                child.kill('SIGTERM');
            } catch (e) { }
        }
    }
    process.exit(0);
};

if (import.meta.url ===  "file://" + process.argv[1] || process.argv[1].endsWith("daemon.ts")) {
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    main().catch(err => log(`Daemon fatal error: ${err}`));
}
