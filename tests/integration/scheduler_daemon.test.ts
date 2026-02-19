import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { join } from 'path';
import { writeFile, mkdir, rm, readFile } from 'fs/promises';
import { existsSync } from 'fs';

const CWD = process.cwd();
const AGENT_DIR = join(CWD, '.agent');
const SCHEDULER_FILE = join(AGENT_DIR, 'scheduler.json');

describe('Scheduler-Daemon Integration', () => {
    let backupScheduler: string | null = null;

    beforeAll(async () => {
        if (existsSync(SCHEDULER_FILE)) {
            backupScheduler = await readFile(SCHEDULER_FILE, 'utf-8');
        }
    });

    afterAll(async () => {
        if (backupScheduler) {
            await writeFile(SCHEDULER_FILE, backupScheduler);
        } else {
            if (existsSync(SCHEDULER_FILE)) await rm(SCHEDULER_FILE);
        }
    });

    it('should run a scheduled task', async () => {
        await mkdir(AGENT_DIR, { recursive: true });

        // Create a scheduler.json with a task due every second
        const task = {
            id: "test-task-1",
            name: "Test Task",
            trigger: "cron",
            schedule: "* * * * * *", // Every second
            prompt: "Echo hello world",
            yoloMode: true
        };

        await writeFile(SCHEDULER_FILE, JSON.stringify({ tasks: [task] }, null, 2));

        console.log("Starting daemon...");
        // Run src/daemon.ts using npx tsx
        const child = spawn('npx', ['tsx', 'src/daemon.ts'], {
            cwd: CWD,
            stdio: 'pipe',
            detached: false,
            env: { ...process.env, PATH: process.env.PATH }
        });

        let output = "";
        let foundTrigger = false;

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                child.kill();
                reject(new Error(`Timeout waiting for task execution. Output:\n${output}`));
            }, 30000); // 30s timeout

            child.stdout?.on('data', (d) => {
                const s = d.toString();
                output += s;
                // console.log(`[STDOUT] ${s}`);
                if (s.includes("[Scheduler] Started")) {
                    foundTrigger = true;
                    clearTimeout(timeout);
                    child.kill();
                    resolve();
                }
            });

            child.stderr?.on('data', (d) => {
                 const s = d.toString();
                 output += s;
                 // console.error(`[Daemon Stderr] ${s}`);
            });

            child.on('exit', (code) => {
                if (!foundTrigger && code !== null) {
                     clearTimeout(timeout);
                     if (!foundTrigger) {
                         reject(new Error(`Daemon exited prematurely with code ${code}. Output:\n${output}`));
                     }
                }
            });
        });

        expect(foundTrigger).toBe(true);
    }, 35000); // Increased test timeout
});
