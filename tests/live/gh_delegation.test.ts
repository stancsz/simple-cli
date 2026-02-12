import { describe, it, expect } from 'vitest';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { existsSync } from 'fs';

const TIMEOUT = 60000; // 1 minute

describe('GitHub CLI Delegation Test', () => {
    it('should use gh CLI via run_command to list PRs', async () => {
        const prompt = "Please list the open pull requests for this repository using the gh command. Just list them.";

        // Ensure bin is in PATH if it exists locally
        const binPath = resolve(process.cwd(), 'bin');
        let env = { ...process.env };
        if (existsSync(binPath)) {
            env.PATH = `${binPath}:${process.env.PATH}`;
        }
        // Ensure GH_PAT is passed if it exists in the parent process
        if (process.env.GH_PAT) {
            env.GH_PAT = process.env.GH_PAT;
        }

        const entryTs = join(process.cwd(), 'src', 'cli.ts');

        // Run the CLI non-interactively
        const cliProcess = spawn(process.execPath, [
            '--loader', 'ts-node/esm',
            entryTs,
            '--non-interactive', // Ensure it doesn't wait for user input
            '.', // Use current directory as workspace
            prompt
        ], {
            env,
            stdio: 'pipe'
        });

        let output = '';
        let errorOutput = '';

        cliProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        cliProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                cliProcess.kill();
                reject(new Error('Test timed out'));
            }, TIMEOUT);

            cliProcess.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) resolve();
                else reject(new Error(`CLI exited with code ${code}. Stderr: ${errorOutput}`));
            });

            cliProcess.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        // Verification
        // We expect the agent to have run 'gh pr list' and output the results.
        // We check for a known PR substring or generic PR line format.
        // Known PR seen in testing: "Integrate Open Claw"
        const foundPR = output.includes('Integrate Open Claw') ||
                       output.includes('openclaw-integration') ||
                       /^\s*\d+\s+.+\s+.+\s+/m.test(output);

        expect(foundPR).toBe(true);
    }, TIMEOUT);
});
