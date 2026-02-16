import { spawn } from 'child_process';
import { existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AGENT_DIR = join(process.cwd(), '.agent');
const PID_FILE = join(AGENT_DIR, 'daemon.pid');

export const daemon = {
  start: async () => {
    if (!existsSync(AGENT_DIR)) {
      mkdirSync(AGENT_DIR, { recursive: true });
    }

    if (existsSync(PID_FILE)) {
      try {
        const pid = readFileSync(PID_FILE, 'utf-8');
        process.kill(parseInt(pid), 0); // Check if process exists
        console.log(`Daemon is already running (PID: ${pid})`);
        return;
      } catch (e) {
        console.log(`Stale PID file found. Removing.`);
        try { unlinkSync(PID_FILE); } catch {}
      }
    }

    console.log("Starting daemon...");

    const isTs = __filename.endsWith('.ts');
    const ext = isTs ? '.ts' : '.js';
    const daemonScript = join(__dirname, '..', `daemon${ext}`);

    // Check if script exists
    if (!existsSync(daemonScript)) {
        console.error(`Daemon script not found at ${daemonScript}`);
        return;
    }

    const args = isTs
       ? ['--loader', 'ts-node/esm', daemonScript]
       : [daemonScript];

    const child = spawn('node', args, {
      detached: true,
      stdio: 'ignore', // Ignore stdio so it doesn't block parent
      cwd: process.cwd(),
      env: process.env
    });

    if (child.pid) {
      writeFileSync(PID_FILE, child.pid.toString());
      console.log(`Daemon started (PID: ${child.pid}). Logs at .agent/ghost.log`);
      child.unref(); // Allow parent to exit
    } else {
      console.error("Failed to start daemon.");
    }
  },

  stop: async () => {
    if (!existsSync(PID_FILE)) {
      console.log("Daemon is not running.");
      return;
    }

    const pidStr = readFileSync(PID_FILE, 'utf-8');
    const pid = parseInt(pidStr);

    if (isNaN(pid)) {
        console.error("Invalid PID file content.");
        try { unlinkSync(PID_FILE); } catch {}
        return;
    }

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`Daemon stopped (PID: ${pid}).`);
      unlinkSync(PID_FILE);
    } catch (e: any) {
      if (e.code === 'ESRCH') {
        console.log("Process not found. Removing PID file.");
        try { unlinkSync(PID_FILE); } catch {}
      } else {
        console.error(`Failed to stop daemon: ${e.message}`);
      }
    }
  },

  status: async () => {
    if (!existsSync(PID_FILE)) {
      console.log("Daemon is stopped.");
      return;
    }

    const pidStr = readFileSync(PID_FILE, 'utf-8');
    const pid = parseInt(pidStr);

    if (isNaN(pid)) {
        console.error("Invalid PID file content.");
        return;
    }

    try {
      process.kill(pid, 0);
      console.log(`Daemon is running (PID: ${pid}).`);
    } catch (e) {
      console.log("Daemon is stopped (stale PID file).");
    }
  }
};
