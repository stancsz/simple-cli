import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

const DAEMON_FILE = 'daemon.json';

interface DaemonEntry {
  taskId: string;
  pid: number;
  startTime: string;
  args: string[];
}

export async function startDaemon(targetDir: string, argv: string[]) {
    // 1. Prepare paths
    const workdir = path.join(targetDir, '.simple', 'workdir');
    const logDir = path.join(workdir, 'logs');
    const daemonFile = path.join(workdir, DAEMON_FILE);

    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    // 2. Generate Task ID
    const taskId = `mission_${Date.now()}`;
    const logFile = path.join(logDir, `${taskId}.log`);

    // 3. Prepare Args
    // Remove --daemon flag
    const args = argv.slice(2).filter(arg => arg !== '--daemon');

    // 4. Open Log File
    const logStream = fs.openSync(logFile, 'a');

    // 5. Spawn Process
    console.log(pc.cyan(`Starting background mission ${taskId}...`));
    console.log(pc.dim(`Logs: ${logFile}`));

    // We use process.execPath (node) and process.argv[1] (script path)
    const child = spawn(process.execPath, [process.argv[1], ...args], {
        detached: true,
        stdio: ['ignore', logStream, logStream],
        cwd: process.cwd(), // Keep original CWD so relative paths in args work
        env: { ...process.env, NON_INTERACTIVE: 'true' }
    });

    if (!child.pid) {
        console.error(pc.red('Failed to start daemon process.'));
        return;
    }

    // 6. Update daemon.json
    const entry: DaemonEntry = {
        taskId,
        pid: child.pid,
        startTime: new Date().toISOString(),
        args
    };

    let daemons: DaemonEntry[] = [];
    if (fs.existsSync(daemonFile)) {
        try {
            daemons = JSON.parse(fs.readFileSync(daemonFile, 'utf-8'));
        } catch (e) {
            // ignore corrupt file
        }
    }
    // Ensure we are working with an array
    if (!Array.isArray(daemons)) {
        daemons = [];
    }

    daemons.push(entry);
    fs.writeFileSync(daemonFile, JSON.stringify(daemons, null, 2));

    console.log(pc.green(`Background process started (PID: ${child.pid})`));

    child.unref();
}

export async function killDaemon(targetDir: string, idOrPid: string): Promise<boolean> {
    const workdir = path.join(targetDir, '.simple', 'workdir');
    const daemonFile = path.join(workdir, DAEMON_FILE);

    if (!fs.existsSync(daemonFile)) {
        return false;
    }

    let daemons: DaemonEntry[] = [];
    try {
        daemons = JSON.parse(fs.readFileSync(daemonFile, 'utf-8'));
    } catch (e) {
        console.log(pc.red('Error reading daemon.json'));
        return false;
    }

    if (!Array.isArray(daemons)) return false;

    const index = daemons.findIndex(d => d.taskId === idOrPid || d.pid.toString() === idOrPid);
    if (index === -1) {
         return false;
    }

    const daemon = daemons[index];
    try {
        process.kill(daemon.pid);
        console.log(pc.green(`Terminated process ${daemon.pid} (${daemon.taskId}).`));
    } catch (e: any) {
        if (e.code === 'ESRCH') {
            console.log(pc.yellow(`Process ${daemon.pid} not found (already dead?).`));
        } else {
            console.error(pc.red(`Failed to kill process ${daemon.pid}:`), e);
        }
    }

    // Cleanup
    daemons.splice(index, 1);
    fs.writeFileSync(daemonFile, JSON.stringify(daemons, null, 2));
    return true;
}
