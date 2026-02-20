import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { mkdir, rm, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

const TEST_DIR = join(process.cwd(), 'temp_test_daemon');
const AGENT_DIR = join(TEST_DIR, '.agent');
const STATE_FILE = join(AGENT_DIR, 'daemon_state.json');

describe('Daemon Resilience Integration', () => {
    let daemonProcess: ChildProcess;

    beforeEach(async () => {
        // Cleanup previous run if exists
        if (existsSync(TEST_DIR)) {
            await rm(TEST_DIR, { recursive: true, force: true });
        }
        await mkdir(AGENT_DIR, { recursive: true });
    });

    afterEach(async () => {
        if (daemonProcess) {
            daemonProcess.kill('SIGTERM');
            // Wait for it to exit
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (existsSync(TEST_DIR)) {
            await rm(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('should start scheduler, persist state, and restart scheduler on crash', async () => {
        // Start Daemon
        console.log("Starting Daemon...");
        daemonProcess = spawn('npx', ['tsx', 'src/daemon.ts'], {
            cwd: process.cwd(),
            env: { ...process.env, JULES_AGENT_DIR: AGENT_DIR },
            stdio: 'pipe'
        });

        // Collect logs for debugging
        daemonProcess.stdout?.on('data', (d) => console.log(`[DAEMON STDOUT] ${d}`));
        daemonProcess.stderr?.on('data', (d) => console.log(`[DAEMON STDERR] ${d}`));

        // Wait for scheduler to start (check state file)
        let schedulerPid: number | null = null;
        let attempts = 0;

        while (attempts < 20) { // Wait up to 20s
            await new Promise(r => setTimeout(r, 1000));
            if (existsSync(STATE_FILE)) {
                const content = await readFile(STATE_FILE, 'utf-8');
                try {
                    const state = JSON.parse(content);
                    if (state.schedulerStatus === 'running' && state.schedulerPid) {
                        schedulerPid = state.schedulerPid;
                        break;
                    }
                } catch (e) { /* ignore parse error while writing */ }
            }
            attempts++;
        }

        expect(schedulerPid).not.toBeNull();
        console.log(`Scheduler started with PID: ${schedulerPid}`);

        // Kill Scheduler
        console.log(`Killing Scheduler PID ${schedulerPid}...`);
        process.kill(schedulerPid!, 'SIGTERM');

        // Wait for restart
        // State should go to 'crashed'/'stopped' then 'running' with new PID
        // Restart count should increment

        let newSchedulerPid: number | null = null;
        let restarts = 0;
        attempts = 0;

        while (attempts < 20) {
            await new Promise(r => setTimeout(r, 1000));
            if (existsSync(STATE_FILE)) {
                const content = await readFile(STATE_FILE, 'utf-8');
                try {
                    const state = JSON.parse(content);
                    if (state.schedulerStatus === 'running' && state.schedulerPid && state.schedulerPid !== schedulerPid) {
                        newSchedulerPid = state.schedulerPid;
                        restarts = state.restarts;
                        break;
                    }
                } catch (e) {}
            }
            attempts++;
        }

        expect(newSchedulerPid).not.toBeNull();
        expect(newSchedulerPid).not.toBe(schedulerPid);
        expect(restarts).toBeGreaterThan(0);
        console.log(`Scheduler restarted with PID: ${newSchedulerPid}. Restarts: ${restarts}`);
    }, 30000); // 30s timeout
});
