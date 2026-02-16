import { join, dirname } from 'path';
import { appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { Scheduler } from './scheduler.js';
import { handleTaskTrigger, killAllChildren } from './scheduler/trigger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CWD = process.cwd();
const AGENT_DIR = join(CWD, '.agent');
const LOG_FILE = join(AGENT_DIR, 'ghost.log');

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

async function main() {
  await log("Daemon starting...");
  await log(`CWD: ${CWD}`);

  const scheduler = new Scheduler(AGENT_DIR);

  scheduler.on('task-triggered', async (task) => {
      await log(`Task triggered: ${task.name} (${task.id})`);
      handleTaskTrigger(task);
  });

  await scheduler.start();
  await log("Scheduler started.");

  setInterval(() => {}, 1000 * 60 * 60); // Keep alive
}

const shutdown = async (signal: string) => {
    await log(`Daemon stopping (${signal})...`);
    killAllChildren();
    process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch(err => log(`Daemon fatal error: ${err}`));
