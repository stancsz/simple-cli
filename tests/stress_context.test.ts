
import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { resolve, join } from 'path';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';

const STRESS_DIR = resolve('./test_stress_limits');

describe('Context Window Stress Test', () => {
    it('should probe the system limitation regarding large tool outputs in history', async () => {
        if (existsSync(STRESS_DIR)) rmSync(STRESS_DIR, { recursive: true, force: true });
        mkdirSync(STRESS_DIR, { recursive: true });

        // Create a tool that generates 1MB of garbage
        const toolsDir = join(STRESS_DIR, 'tools');
        mkdirSync(toolsDir, { recursive: true });

        writeFileSync(join(toolsDir, 'big_data.ts'), `
export const name = 'big_data';
export const description = 'Generates a huge amount of data';
export const execute = async () => 'A'.repeat(1000000); // 1MB
`);

        // Run the agent and ask it to run the tool and then explain the result
        // This will force 1MB of data into the context window
        const cliPath = resolve('./dist/cli.js');
        const child = spawn(process.execPath, [cliPath, STRESS_DIR, 'Run big_data and summarize its content.', '--yolo'], {
            env: { ...process.env, DEBUG: 'true' }
        });

        let output = '';
        child.stdout.on('data', d => output += d.toString());
        child.stderr.on('data', d => output += d.toString());

        await new Promise(r => setTimeout(r, 45000)); // Wait 45s
        child.kill();

        console.log('--- STRESS TEST OUTPUT SNAPSHOT ---');
        console.log(output.substring(0, 1000));
        console.log('--- END SNAPSHOT ---');

        // Check for common error messages when context window is exceeded
        expect(output.toLowerCase()).toContain('error');
        // Likely to contain "maximum context length" or "400" or similar depending on provider
    }, 60000);
});
