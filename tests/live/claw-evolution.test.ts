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
        mkdirSync(join(DEMO_DIR, 'tools'), { recursive: true });
    });

    it('should create a new tool and use it', async () => {
        const intent = "Create a new tool in 'tools/ping_tool.ts' that exports a tool named 'ping_tool' which returns 'PONG CONNECTION SUCCESSFUL'. Then reload tools and call it.";
        const result = await runClaw(intent);

        console.log('\n--- EVOLUTION TEST OUTPUT ---\n', result);

        expect(result).toContain('PONG CONNECTION SUCCESSFUL');
    }, 180000);
});

async function runClaw(intent: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const cliProcess = spawn(process.execPath, [cliPath, DEMO_DIR, '-claw', intent, '--yolo'], {
            env: { ...process.env, CLAW_MODEL: 'google:gemini-3-flash-preview', DEBUG: 'true' }
        });

        let stdout = '';
        cliProcess.stdout.on('data', (data) => stdout += data.toString());
        cliProcess.stderr.on('data', (data) => stdout += data.toString());

        cliProcess.on('close', (code) => {
            resolve(stdout);
        });

        setTimeout(() => cliProcess.kill(), 120000);
    });
}
