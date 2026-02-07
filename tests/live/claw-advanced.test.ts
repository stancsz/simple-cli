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
    }, 180000); // 3 min timeout for setup

    it('should inject CLAW_* environment variables', async () => {
        // Create a skill that logs environment variables
        const skillsDir = join(DEMO_DIR, 'skills');
        mkdirSync(skillsDir, { recursive: true });

        const skillPath = join(skillsDir, 'env_check.js');
        writeFileSync(skillPath, `
console.log("WORKSPACE=" + process.env.CLAW_WORKSPACE);
console.log("DATA=" + process.env.CLAW_DATA_DIR);
console.log("INPUT=" + process.env.INPUT_TEST_ARG);
`);

        const skillMetaPath = join(skillsDir, 'env_check.md');
        writeFileSync(skillMetaPath, `---
name: env_check
command: node ${skillPath}
parameters:
  test_arg: string
---
`);

        // Run claw mode to trigger the skill
        const result = await runClaw('Use the env_check tool with test_arg="HELLO_WORLD"');

        expect(result, `CLI Output: ${result}`).toContain('WORKSPACE=');
        expect(result, `CLI Output: ${result}`).toContain('DATA=');
        expect(result, `CLI Output: ${result}`).toContain('INPUT=HELLO_WORLD');
    }, 180000);

    it('should support scheduler tool', async () => {
        const intent = "Schedule a task named 'bingo' that runs every 5 minutes. Do nothing else.";
        const result = await runClaw(intent);

        // On Windows it uses schtasks, on Linux crontab
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
        const cliProcess = spawn(process.execPath, [cliPath, DEMO_DIR, '-claw', intent, '--yolo'], {
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

        // Increase timeout to 120s
        setTimeout(() => {
            console.log('    [DEBUG] runClaw timed out after 120s');
            cliProcess.kill();
        }, 120000);
    });
}
