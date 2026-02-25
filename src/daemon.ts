import chokidar from 'chokidar';
import { join, dirname } from 'path';
import { readFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { TaskDefinition } from './interfaces/daemon.js';
import { DEFAULT_TASKS } from './scheduler/config.js';
import { Scheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const CWD = process.cwd();
const AGENT_DIR = join(CWD, '.agent');
const LOG_FILE = join(AGENT_DIR, 'daemon.log');
const MCP_CONFIG_FILE = join(CWD, 'mcp.json');

let scheduler: Scheduler;

async function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  try {
    if (!existsSync(AGENT_DIR)) {
      // Create .agent dir if not exists
    }
    await appendFile(LOG_FILE, line);
  } catch (e) {
    console.error(`Failed to write log: ${e}`);
  }
  console.log(line.trim());
}

// Only load MCP tasks, Scheduler handles scheduler.json
export async function loadMcpTasks(): Promise<TaskDefinition[]> {
  let tasks: TaskDefinition[] = [...DEFAULT_TASKS];

  // Helper to merge tasks (override by ID)
  const mergeTasks = (newTasks: TaskDefinition[]) => {
      const taskMap = new Map(tasks.map(t => [t.id, t]));
      for (const t of newTasks) {
          taskMap.set(t.id, t);
      }
      tasks = Array.from(taskMap.values());
  };

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

  return tasks;
}

async function main() {
  await log("Daemon starting...");
  await log(`CWD: ${CWD}`);

  scheduler = new Scheduler(AGENT_DIR);
  await scheduler.start();

  // Initial load of MCP tasks
  const mcpTasks = await loadMcpTasks();
  await scheduler.setMcpTasks(mcpTasks);
  await log(`Loaded ${mcpTasks.length} tasks from mcp.json`);

  // Watch mcp.json for changes
  if (existsSync(MCP_CONFIG_FILE)) {
      const mcpWatcher = chokidar.watch(MCP_CONFIG_FILE, { persistent: true, ignoreInitial: true });
      mcpWatcher.on('change', async () => {
          await log("mcp.json changed. Reloading schedule...");
          const tasks = await loadMcpTasks();
          await scheduler.setMcpTasks(tasks);
      });
  } else {
      // Watch cwd for creation of mcp.json
      const dirWatcher = chokidar.watch(CWD, { depth: 0, persistent: true, ignoreInitial: true });
      dirWatcher.on('add', async (path) => {
          if (path === MCP_CONFIG_FILE) {
               await log("mcp.json created. Loading schedule...");
               const tasks = await loadMcpTasks();
               await scheduler.setMcpTasks(tasks);
          }
      });
  }

  // Scheduler handles scheduler.json watching internally

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
    if (scheduler) {
        await scheduler.stop();
        // Scheduler's JobDelegator might have active children?
        // JobDelegator in scheduler.ts spawns via trigger.ts
        // trigger.ts tracks activeChildren separately?
        // trigger.ts is a module, state is module-scoped.
        // We should export killAllChildren from trigger.ts and call it?
        // Or Scheduler can call it.
    }

    // Fallback kill
    const { killAllChildren } = await import('./scheduler/trigger.js');
    killAllChildren();

    process.exit(0);
};

if (import.meta.url ===  "file://" + process.argv[1] || process.argv[1].endsWith("daemon.ts")) {
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    main().catch(err => log(`Daemon fatal error: ${err}`));
}
