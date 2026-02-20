import { spawn, ChildProcess } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { StateManager } from './daemon/state_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const isTs = __filename.endsWith('.ts');
const ext = isTs ? '.ts' : '.js';

const CWD = process.cwd();
const AGENT_DIR = process.env.JULES_AGENT_DIR || join(CWD, '.agent');
const LOG_DIR = join(AGENT_DIR, 'logs');
const LOG_FILE = join(LOG_DIR, 'daemon.log');

// Ensure log dir exists
if (!existsSync(LOG_DIR)) {
    // We can't use await at top level without top-level await support (ESM has it, but safe to wrap or sync check)
    // mkdir is async, let's just do it in main
}

const stateManager = new StateManager(AGENT_DIR);
let schedulerProcess: ChildProcess | null = null;
let isShuttingDown = false;

async function log(msg: string) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [DAEMON] ${msg}\n`;
  try {
      if (!existsSync(LOG_DIR)) await mkdir(LOG_DIR, { recursive: true });
      await appendFile(LOG_FILE, line);
  } catch (e) {
      console.error(`Failed to write log: ${e}`);
  }
  console.log(line.trim());
}

async function startScheduler() {
    if (isShuttingDown) return;

    await log("Starting Scheduler process...");

    // Path to scheduler service script
    const serviceScript = join(__dirname, 'scheduler', `service${ext}`);

    const args = isTs
        ? ['--loader', 'ts-node/esm', serviceScript]
        : [serviceScript];

    schedulerProcess = spawn('node', args, {
        cwd: CWD,
        stdio: 'pipe', // We want to capture output to log it
        env: { ...process.env, FORCE_COLOR: '1' }
    });

    if (schedulerProcess.pid) {
        await stateManager.update(state => {
            state.schedulerPid = schedulerProcess!.pid;
            state.schedulerStatus = 'running';
        });
        await log(`Scheduler started with PID ${schedulerProcess.pid}`);
    }

    schedulerProcess.stdout?.on('data', async (data) => {
        const lines = data.toString().trim().split('\n');
        for (const line of lines) {
            if (!line) continue;

            // Check for state updates
            try {
                if (line.includes('[STATE_ACTION]')) {
                    const jsonStr = line.substring(line.indexOf('{'));
                    const action = JSON.parse(jsonStr);

                    if (action.type === 'STATE_ACTION') {
                        await stateManager.update(state => {
                            if (action.action === 'add' && action.task) {
                                // Avoid duplicates
                                const exists = state.activeTasks.some(t => t.id === action.task.id);
                                if (!exists) state.activeTasks.push(action.task);
                            } else if (action.action === 'remove' && action.taskId) {
                                state.activeTasks = state.activeTasks.filter(t => t.id !== action.taskId);
                            }
                        });
                        continue; // Don't log state actions to avoid clutter
                    }
                }
            } catch (e) {
                // Not a valid JSON or state action, treat as log
            }

            log(`[SCHEDULER] ${line}`);
        }
    });

    schedulerProcess.stderr?.on('data', (data) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach((line: string) => {
             if (line) log(`[SCHEDULER ERROR] ${line}`);
        });
    });

    schedulerProcess.on('close', async (code) => {
        await log(`Scheduler exited with code ${code}`);
        schedulerProcess = null;

        await stateManager.update(state => {
            state.schedulerPid = null;
            state.schedulerStatus = code === 0 ? 'stopped' : 'crashed';
            if (code !== 0) state.restarts += 1;
        });

        if (!isShuttingDown) {
            if (code !== 0) {
                await log("Scheduler crashed. Restarting in 5 seconds...");
                setTimeout(startScheduler, 5000);
            } else {
                await log("Scheduler stopped cleanly. Daemon will stay alive.");
            }
        }
    });

    schedulerProcess.on('error', async (err) => {
        await log(`Failed to spawn Scheduler: ${err.message}`);
        if (!isShuttingDown) {
            setTimeout(startScheduler, 5000);
        }
    });
}

async function main() {
    await log("Daemon Supervisor starting...");
    await log(`CWD: ${CWD}`);

    // Initialize state
    await stateManager.update(state => {
        state.daemonStartedAt = Date.now();
    });

    await startScheduler();

    // Heartbeat loop
    setInterval(async () => {
        await stateManager.update(state => {
            state.lastHeartbeat = Date.now();
        });
    }, 1000 * 30); // 30s heartbeat
}

const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    await log(`Daemon stopping (${signal})...`);

    if (schedulerProcess) {
        await log(`Killing Scheduler (PID ${schedulerProcess.pid})...`);
        schedulerProcess.kill('SIGTERM');
        // Wait briefly?
    }

    await stateManager.update(state => {
        state.schedulerStatus = 'stopped';
        state.schedulerPid = null;
    });

    setTimeout(() => process.exit(0), 1000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch(err => log(`Daemon fatal error: ${err}`));
