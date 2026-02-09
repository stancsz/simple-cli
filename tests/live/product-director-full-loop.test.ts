import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, rmSync, cpSync, mkdirSync, readFileSync, appendFileSync } from 'fs';

const TEST_DIR = resolve('temp_product_director_test');
const SOURCE_DIR = resolve('examples/product-director');
const LOG_FILE = resolve('docs/feedbacks/product-director-full-loop.log.md');
const CLI_PATH = resolve('dist/cli.js');

describe('Product Director - Full Loop Live Test', () => {
    beforeAll(() => {
        // Cleanup existing test dir and log file
        if (existsSync(TEST_DIR)) {
            rmSync(TEST_DIR, { recursive: true, force: true });
        }
        if (existsSync(LOG_FILE)) {
            rmSync(LOG_FILE);
        }

        // Setup
        if (!existsSync(resolve('docs/feedbacks'))) {
            mkdirSync(resolve('docs/feedbacks'), { recursive: true });
        }
        appendFileSync(LOG_FILE, '# Product Director Live Test Log\n\n');

        // Copy example directory to temp test dir
        if (!existsSync(SOURCE_DIR)) {
            throw new Error(`Source directory ${SOURCE_DIR} not found. Ensure examples/product-director exists.`);
        }
        cpSync(SOURCE_DIR, TEST_DIR, { recursive: true });
    }, 60000);

    afterAll(() => {
        // Optional cleanup
        if (process.env.CLEANUP !== 'false') {
             // rmSync(TEST_DIR, { recursive: true, force: true });
        }
    });

    it('should build a weather-cli tool from scratch', async () => {
        const prompt = "Build a simple CLI tool called 'weather-cli' that fetches weather data for a given city using a public API. You must use the 'write_files' tool to create artifacts. First, create 'reports/market_research.md' with findings. Then create 'design/wireframes.md' with design. Finally, create 'src/weather_cli.ts' with the implementation. Do not just plan or explain, EXECUTE the first step immediately. Perform one step at a time.";

        appendFileSync(LOG_FILE, `## Prompt\n${prompt}\n\n## Execution Log\n`);

        await new Promise<void>((resolvePromise, rejectPromise) => {
            const cliProcess = spawn('node', [CLI_PATH, prompt, '--non-interactive'], {
                cwd: TEST_DIR,
                env: {
                    ...process.env,
                    MODEL: 'openai:gpt-4o',
                },
                stdio: 'pipe'
            });

            cliProcess.stdout.on('data', (data) => {
                const chunk = data.toString();
                // process.stdout.write(chunk); // Optional: print to console
                appendFileSync(LOG_FILE, chunk);
            });

            cliProcess.stderr.on('data', (data) => {
                const chunk = data.toString();
                // process.stderr.write(chunk); // Optional: print to console
                appendFileSync(LOG_FILE, chunk);
            });

            cliProcess.on('close', (code) => {
                appendFileSync(LOG_FILE, `\n\nEXIT CODE: ${code}\n`);
                if (code === 0) resolvePromise();
                else rejectPromise(new Error(`CLI exited with code ${code}`));
            });

            // Timeout 5 minutes
            const timeout = setTimeout(() => {
                cliProcess.kill();
                rejectPromise(new Error('Test timed out after 5 minutes'));
            }, 300000);

            cliProcess.on('exit', () => clearTimeout(timeout));
        });

        // Verification
        const expectedFiles = [
            'reports/market_research.md',
            'design/wireframes.md',
            'src/weather_cli.ts'
        ];

        appendFileSync(LOG_FILE, '\n## Verification\n');

        let missing = 0;
        for (const file of expectedFiles) {
            const path = join(TEST_DIR, file);
            const exists = existsSync(path);
            appendFileSync(LOG_FILE, `- ${file}: ${exists ? 'OK' : 'MISSING'}\n`);
            if (!exists) missing++;
        }

        expect(missing).toBe(0);

    }, 300000); // 5 minutes
});
