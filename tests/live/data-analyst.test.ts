/**
 * Live Test: Data Analyst Workflow
 *
 * This test demonstrates the data analysis capabilities:
 * 1. Fetches public data (Titanic dataset)
 * 2. Loads it into SQLite using a Python script
 * 3. Writes SQL to analyze the data
 * 4. Generates a report
 *
 * Run with: npm run test:live -- tests/live/data-analyst.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, appendFileSync } from 'fs';
import { join } from 'path';

const DEMO_DIR = join(process.cwd(), 'data_analyst_demo');
const LOG_FILE = join(process.cwd(), 'docs/feedbacks/data-analyst.log.md');
const TIMEOUT = 300000; // 5 minutes

describe('Data Analyst Workflow', () => {
    beforeAll(() => {
        try {
            console.log('🧹 Cleaning existing demo dir...');
            if (existsSync(DEMO_DIR)) {
                rmSync(DEMO_DIR, { recursive: true, force: true });
            }

            console.log('📂 Creating demo directory structure...');
            mkdirSync(DEMO_DIR, { recursive: true });

            // Initialize log file
            writeFileSync(LOG_FILE, '# Data Analyst Live Test Log\n\n');

            console.log('✅ Demo environment created at:', DEMO_DIR);
        } catch (error) {
            console.error('❌ beforeAll failed:', error);
            throw error;
        }
    });

    afterAll(() => {
        // Cleanup
        if (existsSync(DEMO_DIR)) {
            // rmSync(DEMO_DIR, { recursive: true, force: true });
        }
        console.log('🧹 Demo environment cleaned up (preserved for inspection)');
    });

    async function runAgent(intent: string) {
        appendFileSync(LOG_FILE, `\n\n## Intent: ${intent}\n\n`);

        return new Promise<void>((resolve, reject) => {
            const entryTs = join(process.cwd(), 'src', 'cli.ts');
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
            }, 240000); // 4 minutes

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

    it('should fetch data, load into sqlite, analyze and report', async () => {
        const intent = `You are a Data Analyst.
        1. Fetch the CSV data from "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv" and save it as "titanic.csv".
        2. Create a Python script "load_data.py" to read "titanic.csv" and load it into a SQLite database "analysis.db" with a table named "passengers". Run the script.
        3. Create a SQL query to calculate the survival rate by passenger class (Pclass). Save the SQL to "analysis.sql".
        4. Run the SQL query against the database using a Python script "run_analysis.py" and save the result to "report.md" formatted as a markdown table with a brief analysis.`;

        console.log('\n🧬 Starting Data Analyst Agent...');
        await runAgent(intent);

        // Verification
        console.log('\n🔍 Verifying artifacts...');

        const csvPath = join(DEMO_DIR, 'titanic.csv');
        const dbPath = join(DEMO_DIR, 'analysis.db');
        const sqlPath = join(DEMO_DIR, 'analysis.sql');
        const reportPath = join(DEMO_DIR, 'report.md');

        expect(existsSync(csvPath), 'titanic.csv should exist').toBe(true);
        expect(existsSync(dbPath), 'analysis.db should exist').toBe(true);
        expect(existsSync(sqlPath), 'analysis.sql should exist').toBe(true);
        expect(existsSync(reportPath), 'report.md should exist').toBe(true);

        const reportContent = readFileSync(reportPath, 'utf-8');
        console.log('\n📊 Report Content:\n', reportContent);

        expect(reportContent.toLowerCase()).toContain('pclass');
        expect(reportContent.toLowerCase()).toContain('survival');
        // Check for basic markdown table structure
        expect(reportContent).toContain('|');

    }, TIMEOUT);
});
