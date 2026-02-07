import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { mkdirSync, existsSync, rmSync, readFileSync } from 'fs';

const DEMO_DIR = resolve('./test_claw_evolution');
const cliPath = resolve('./dist/cli.js');

describe('Claw Self-Evolution', () => {
    beforeAll(() => {
        if (existsSync(DEMO_DIR)) {
            rmSync(DEMO_DIR, { recursive: true, force: true });
        }
        mkdirSync(DEMO_DIR, { recursive: true });
    });

    it('should create a new tool and use it', async () => {
        const intent = "Step 1: Write a file named 'ping_source.js' that exports a tool object named 'ping_tool' with an execute function that returns 'PONG CONNECTION SUCCESSFUL'. Step 2: Use 'create_tool' to register it. Step 3: Call 'ping_tool'. execute all steps immediately without asking for confirmation.";
        const result = await runClaw(intent);

        console.log('\n--- EVOLUTION TEST OUTPUT ---\n', result);

        expect(result).toContain('PONG CONNECTION SUCCESSFUL');
    }, 300000);
});

async function runClaw(intent: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const cliProcess = spawn(process.execPath, [cliPath, DEMO_DIR, '-claw', intent, '--yolo'], {
            env: { ...process.env, CLAW_MODEL: 'google:gemini-1.5-flash', DEBUG: 'true' }
        });

        let stdout = '';
        cliProcess.stdout.on('data', (data) => stdout += data.toString());
        cliProcess.stderr.on('data', (data) => stdout += data.toString());

        cliProcess.on('close', (code) => {
            resolve(stdout);
        });

        setTimeout(() => cliProcess.kill(), 180000);
    });
}
