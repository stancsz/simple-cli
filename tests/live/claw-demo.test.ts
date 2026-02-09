/**
 * Live Test: Claw Mode Demo
 * 
 * This test demonstrates the --claw functionality:
 * 1. Creates a demo Downloads folder with sample files
 * 2. Runs simple-cli with claw intent to organize files (every 5 mins)
 * 3. Verifies files are sorted and receipts are logged
 * 4. Adds more files and runs again
 * 
 * Run with: npm run test:live -- tests/live/claw-demo.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync, spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const DEMO_DIR = join(process.cwd(), 'demo_downloads');
const LOG_FILE = join(process.cwd(), 'docs/feedbacks/claw-demo.log.md');
const TIMEOUT = 300000; // 5 minutes for double run with potentially slow LLMs

describe('Claw Mode Demo - File Organization', () => {
    beforeAll(() => {
        try {
            console.log('🧹 Cleaning existing demo dir...');
            if (existsSync(DEMO_DIR)) {
                rmSync(DEMO_DIR, { recursive: true, force: true });
            }

            console.log('📂 Creating demo directory structure...');
            mkdirSync(DEMO_DIR, { recursive: true });
            mkdirSync(join(DEMO_DIR, 'Photos'), { recursive: true });
            mkdirSync(join(DEMO_DIR, 'Documents'), { recursive: true });
            mkdirSync(join(DEMO_DIR, 'Trash'), { recursive: true });

            console.log('📝 Creating initial sample files...');
            writeFileSync(join(DEMO_DIR, 'vacation.jpg'), 'fake image data');
            writeFileSync(join(DEMO_DIR, 'invoice.pdf'), 'fake document data');
            writeFileSync(join(DEMO_DIR, 'setup.msi'), 'fake installer data');
            writeFileSync(join(DEMO_DIR, 'receipt_starbucks.txt'), 'Receipt\nTotal: $12.50\nDate: 2026-01-31');
            writeFileSync(join(DEMO_DIR, 'Expenses.csv'), 'Date,Amount,Description\n');

            console.log('✅ Demo environment created at:', DEMO_DIR);
        } catch (error) {
            console.error('❌ beforeAll failed:', error);
            throw error;
        }
    });

    afterAll(() => {
        // Cleanup
        if (existsSync(DEMO_DIR)) {
            rmSync(DEMO_DIR, { recursive: true, force: true });
        }
        console.log('🧹 Demo environment cleaned up');
    });

    async function runClaw(intent: string) {
        appendFileSync(LOG_FILE, `\n\n## Intent: ${intent}\n\n`);

        return new Promise<void>((resolve, reject) => {
            const entryTs = join(process.cwd(), 'src', 'cli.ts');
            // Ensure args match new cli.ts logic: directory first, then intent
            const cliProcess = spawn(process.execPath, ['--loader', 'ts-node/esm', entryTs, DEMO_DIR, intent], {
                env: {
                    ...process.env,
                    MODEL: 'openai:gpt-4o',
                    COLUMNS: '100',
                    LINES: '24',
                    TS_NODE_TRANSPILE_ONLY: '1',
                    CLAW_WORKSPACE: process.env.CLAW_WORKSPACE || join(process.cwd(), 'examples/full-agent/.agent')
                },
                stdio: 'pipe'
            });

            cliProcess.stdout.on('data', (data) => {
                process.stdout.write(data);
                appendFileSync(LOG_FILE, data);
            });
            cliProcess.stderr.on('data', (data) => {
                process.stderr.write(data);
                appendFileSync(LOG_FILE, data);
            });

            const timeout = setTimeout(() => {
                cliProcess.kill();
                resolve(); // Consider timeout as finished for demo
            }, 180000); // 3 minutes per pass for slower models

            cliProcess.on('close', (code) => {
                clearTimeout(timeout);
                resolve();
            });

            cliProcess.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });
    }

    it('should generate JIT agent and organize files in batches', async () => {
        // Updated intent to be "Scan the current directory" instead of "Downloads folder" to avoid confusion
        const intent = 'Scan the current directory. Sort images (jpg, png) into /Photos, docs (pdf, docx) into /Documents, and installers (exe, msi) into /Trash. If you find a receipt, extract the total and append it to Expenses.csv (read existing file first to preserve history) before moving the file. Execute the first step immediately. Perform one action at a time. Do not batch tool calls.';

        console.log('\n🧬 Starting Claw Mode Demo Phase 1...');
        await runClaw(intent);

        // Verify Phase 1
        const photos1 = readdirSync(join(DEMO_DIR, 'Photos'));
        console.log('Phase 1 Photos:', photos1);

        // Add Phase 2 files
        console.log('\n🧬 Phase 2: Adding more files...');
        writeFileSync(join(DEMO_DIR, 'family.png'), 'more image data');
        writeFileSync(join(DEMO_DIR, 'receipt_dinner.txt'), 'Dinner Receipt\nTotal: $45.00\nDate: 2026-01-31');

        console.log('🧬 Running Claw Mode again...');
        await runClaw(intent);

        // Verify Phase 2
        const photos2 = readdirSync(join(DEMO_DIR, 'Photos'));
        console.log('Phase 2 Photos:', photos2);

        const expensesContent = readFileSync(join(DEMO_DIR, 'Expenses.csv'), 'utf-8');
        console.log('\n💰 Final Expenses Log:\n', expensesContent);

        expect(photos2.length).toBeGreaterThan(photos1.length);
        expect(expensesContent).toContain('12.50');
        expect(expensesContent).toContain('45.00');
    }, TIMEOUT);
});
