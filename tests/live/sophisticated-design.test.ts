import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), 'temp_sophisticated_test');
const LOG_FILE = join(process.cwd(), 'docs/feedbacks/sophisticated-design.log.md');
const TIMEOUT = 300000; // 5 minutes

describe('Sophisticated Design Test - Runtime Tool Creation', () => {
    beforeAll(() => {
        // Cleanup existing test dir and log
        if (existsSync(TEST_DIR)) {
            rmSync(TEST_DIR, { recursive: true, force: true });
        }

        // Ensure log directory exists
        if (!existsSync(join(process.cwd(), 'docs/feedbacks'))) {
            mkdirSync(join(process.cwd(), 'docs/feedbacks'), { recursive: true });
        }

        writeFileSync(LOG_FILE, '# Sophisticated Design Test Log\n\n');

        // Create the test directory
        mkdirSync(TEST_DIR, { recursive: true });
    });

    afterAll(() => {
        if (process.env.CLEANUP !== 'false') {
             rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('should create a custom tool at runtime and use it', async () => {
        const prompt = `
I need you to create a new tool and then use it.
Step 1: Create a file named 'math_tool.js' that exports a tool object.
The tool should be named 'math_tool'.
It must take two numbers 'a' and 'b' and return the result of (a + b) * 10.
The file content must start with 'export const tool = { ... }'.
Step 2: Use the 'create_tool' function to register 'math_tool.js' as a tool named 'math_tool'.
Step 3: Wait for the tool to be ready.
Step 4: Use the new 'math_tool' to calculate the value for a=5 and b=3.
Step 5: Write the result to 'math_result.txt'.
Do not skip steps. Execute them one by one.
`;

        writeFileSync(LOG_FILE, `## Prompt\n${prompt}\n\n## Execution Log\n`, { flag: 'a' });

        await new Promise<void>((resolve, reject) => {
            const entryTs = join(process.cwd(), 'src', 'cli.ts');

            // Use ts-node/esm loader to run src/cli.ts
            const cliProcess = spawn(process.execPath, ['--loader', 'ts-node/esm', entryTs, TEST_DIR, prompt], {
                env: {
                    ...process.env,
                    MODEL: 'openai:gpt-4o', // Ensure powerful model is used
                },
                stdio: 'pipe'
            });

            cliProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                // process.stdout.write(chunk); // Uncomment for debugging
                writeFileSync(LOG_FILE, chunk, { flag: 'a' });
            });

            cliProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                // process.stderr.write(chunk); // Uncomment for debugging
                writeFileSync(LOG_FILE, chunk, { flag: 'a' });
            });

            const timeout = setTimeout(() => {
                cliProcess.kill();
                reject(new Error('Test timed out after 5 minutes'));
            }, TIMEOUT);

            cliProcess.on('close', (code) => {
                clearTimeout(timeout);
                writeFileSync(LOG_FILE, `\n\nEXIT CODE: ${code}\n`, { flag: 'a' });
                if (code === 0) resolve();
                else reject(new Error(`CLI exited with code ${code}`));
            });

            cliProcess.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        // Verification
        const toolPath = join(TEST_DIR, '.agent/tools/math_tool.js');
        const resultPath = join(TEST_DIR, 'math_result.txt');

        expect(existsSync(toolPath), 'Tool file should be created').toBe(true);
        expect(existsSync(resultPath), 'Result file should be created').toBe(true);

        const content = readFileSync(resultPath, 'utf-8');
        console.log('Result content:', content);
        // (5 + 3) * 10 = 80
        expect(content).toContain('80');

    }, TIMEOUT);
});
