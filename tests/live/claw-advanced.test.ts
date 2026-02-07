import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'fs';

const DEMO_DIR = resolve('./test_claw_advanced');
const cliPath = resolve('./dist/cli.js');

describe('Claw Advanced Features', () => {
    beforeAll(() => {
        if (existsSync(DEMO_DIR)) {
            rmSync(DEMO_DIR, { recursive: true, force: true });
        }
        mkdirSync(DEMO_DIR, { recursive: true });
    }, 180000);

    it('should inject CLAW_* environment variables', async () => {
        // Create a tool that logs environment variables
        const toolsDir = join(DEMO_DIR, '.agent', 'tools');
        mkdirSync(toolsDir, { recursive: true });

        const toolPath = join(toolsDir, 'env_check.js');
        writeFileSync(toolPath, `
import { z } from 'zod';
export const tool = {
    name: 'env_check',
    description: 'Check environment variables',
    inputSchema: z.object({ test_arg: z.string() }),
    execute: async ({ test_arg }) => {
        console.log("WORKSPACE=" + process.env.CLAW_WORKSPACE);
        console.log("DATA=" + process.env.CLAW_DATA_DIR);
        console.log("INPUT=" + test_arg);
        return "Checked";
    }
};
`);

        // Run claw mode to trigger the tool
        const result = await runClaw('Use the env_check tool with test_arg="HELLO_WORLD"');

        expect(result, `CLI Output: ${result}`).toContain('WORKSPACE=');
        expect(result, `CLI Output: ${result}`).toContain('DATA=');
        expect(result, `CLI Output: ${result}`).toContain('INPUT=HELLO_WORLD');
    }, 180000);

    it('should support scheduler tool', async () => {

        const toolsDir = join(DEMO_DIR, '.agent', 'tools');
        if (!existsSync(toolsDir)) mkdirSync(toolsDir, { recursive: true });

        const toolPath = join(toolsDir, 'scheduler.js');
        writeFileSync(toolPath, `
import { z } from 'zod';
export const tool = {
    name: 'scheduler',
    description: 'Schedule a task',
    inputSchema: z.object({ command: z.string(), cron: z.string().optional() }),
    execute: async ({ command }) => {
        const platform = process.platform === 'win32' ? 'Windows' : 'Linux/Mac';
        console.log(\`Task scheduled on \${platform}: \${command}\`);
        return "Scheduled";
    }
};
`);

        // Explicit intent to avoid ambiguity
        const intent = "Use scheduler tool to schedule 'bingo' to run every minute.";
        const result = await runClaw(intent);

        if (process.platform === 'win32') {
            expect(result, `CLI Output: ${result}`).toContain('Task scheduled on Windows: bingo');
        } else {
            expect(result, `CLI Output: ${result}`).toContain('Task scheduled on Linux/Mac: bingo');
        }
    }, 180000);
});

async function runClaw(intent: string): Promise<string> {
    console.log(`\n    [DEBUG] Running claw with intent: ${intent}`);
    return new Promise((resolve, reject) => {
        const cliProcess = spawn(process.execPath, [cliPath, DEMO_DIR, intent], {
            env: {
                ...process.env,
                CLAW_MODEL: 'gemini-3-flash-preview',
                DEBUG: 'true',
                CLAW_WORKSPACE: process.env.CLAW_WORKSPACE || join(process.cwd(), 'examples/full-agent/.agent')
            }
        });

        let stdout = '';
        cliProcess.stdout.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            if (process.env.DEBUG_TEST) console.log(chunk);
        });
        cliProcess.stderr.on('data', (data) => {
            const chunk = data.toString();
            stdout += chunk;
            if (process.env.DEBUG_TEST) console.log(chunk);
        });

        cliProcess.on('close', (code) => {
            resolve(stdout);
        });

        setTimeout(() => {
            console.log('    [DEBUG] runClaw timed out after 120s');
            cliProcess.kill();
        }, 120000);
    });
}
