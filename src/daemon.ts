import cron from 'node-cron';
import chokidar from 'chokidar';
import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { readFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { ScheduleConfig, TaskDefinition } from './daemon/task_definitions.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isTs = __filename.endsWith('.ts');
const ext = isTs ? '.ts' : '.js';

const CWD = process.cwd();
const AGENT_DIR = join(CWD, '.agent');
const LOG_FILE = join(AGENT_DIR, 'ghost.log');
const SCHEDULE_FILE = join(AGENT_DIR, 'scheduler.json');

// State tracking
const activeChildren = new Set<ChildProcess>();
const cronJobs: any[] = []; // Use any to avoid type issues with node-cron types
const taskFileWatchers: any[] = []; // Use any to avoid type issues with chokidar types

async function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}\n`;
  try {
    if (!existsSync(AGENT_DIR)) {
      // Create .agent dir if not exists? Usually it exists.
    }
    await appendFile(LOG_FILE, line);
  } catch (e) {
    console.error(`Failed to write log: ${e}`);
  }
  // Also log to stdout for debugging if attached or captured
  console.log(line.trim());
}

async function loadSchedule(): Promise<ScheduleConfig> {
  if (!existsSync(SCHEDULE_FILE)) {
    await log(`Schedule file not found: ${SCHEDULE_FILE}`);
    return { tasks: [] };
  }
  try {
    const content = await readFile(SCHEDULE_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    await log(`Error reading schedule: ${e}`);
    return { tasks: [] };
  }
}

async function runTask(task: TaskDefinition) {
  await log(`Triggering task: ${task.name} (${task.id})`);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    JULES_TASK_DEF: JSON.stringify(task)
  };

  if (task.company) {
    env.JULES_COMPANY = task.company;
  }

  // Use run_task in src/daemon/ directory
  const runTaskScript = join(__dirname, 'daemon', `run_task${ext}`);

  const args = isTs
       ? ['--loader', 'ts-node/esm', runTaskScript]
       : [runTaskScript];

  const child = spawn('node', args, {
    env,
    cwd: CWD,
    stdio: 'pipe' // Capture stdout/stderr
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

  // Clear existing cron jobs
  cronJobs.forEach(job => job.stop());
  cronJobs.length = 0;

  // Clear existing task watchers
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
          // Use ignoreInitial to avoid triggering on startup
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

  // Setup persistent watcher for schedule file
  // Check if file exists to decide how to watch
  if (existsSync(SCHEDULE_FILE)) {
      const scheduleWatcher = chokidar.watch(SCHEDULE_FILE, { persistent: true, ignoreInitial: true });
      scheduleWatcher.on('change', async () => {
          await log("Schedule file changed. Reloading...");
          await applySchedule();
      });
      // We don't add scheduleWatcher to taskFileWatchers so it persists across reloads
  } else {
      // Watch directory for creation of schedule file?
      // Simpler: just try to watch the file path even if it doesn't exist?
      // Chokidar can watch non-existent paths if using globs, but specific file?
      // Let's stick to simple logic: if it doesn't exist, we just wait.
      // If user creates it, they might need to restart daemon or we can watch directory.
      // Watching .agent directory for 'add' event is safer.
      if (existsSync(AGENT_DIR)) {
          const dirWatcher = chokidar.watch(AGENT_DIR, { persistent: true, ignoreInitial: true });
          dirWatcher.on('add', async (path) => {
              if (path === SCHEDULE_FILE) {
                  await log("Schedule file created. Loading...");
                  await applySchedule();
                  // Once created, we could switch to watching the file specifically,
                  // but dir watcher is fine for now if we filter by path.
                  // However, 'change' events on file might not trigger 'add'.
                  // So we might need to handle 'change' in dir watcher too.

                  // For simplicity, let's just tell user to restart daemon if they create schedule file
                  // or rely on them editing it (triggering change if we watched it).
                  // But we are not watching it if it didn't exist.

                  // Let's implement dynamic switch.
                  dirWatcher.close();
                  const scheduleWatcher = chokidar.watch(SCHEDULE_FILE, { persistent: true, ignoreInitial: true });
                  scheduleWatcher.on('change', async () => {
                      await log("Schedule file changed. Reloading...");
                      await applySchedule();
                  });
              }
          });
      }
  }

  setInterval(() => {}, 1000 * 60 * 60); // Keep alive
}

const shutdown = async (signal: string) => {
    await log(`Daemon stopping (${signal})...`);

    // Kill child processes
    if (activeChildren.size > 0) {
        await log(`Killing ${activeChildren.size} active tasks...`);
        for (const child of activeChildren) {
            try {
                child.kill('SIGTERM');
            } catch (e) {
                // ignore
            }
        }
    }

    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch(err => log(`Daemon fatal error: ${err}`));
