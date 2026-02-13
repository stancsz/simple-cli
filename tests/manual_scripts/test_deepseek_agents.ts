import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { chdir, cwd } from 'process';

const TIMEOUT_MS = 60000; // 60 seconds timeout per agent

async function runAgent(name: string, command: string, args: string[], cwdPath: string) {
    console.log(`[${name}] Starting...`);
    return new Promise<void>((resolve, reject) => {
        // shell: false ensures arguments are passed correctly without being split by shell
        const child = spawn(command, args, {
            cwd: cwdPath,
            env: { ...process.env },
            stdio: ['ignore', 'inherit', 'inherit'], // Test with ignored stdin to simulate non-interactive env
            shell: false
        });

        const timer = setTimeout(() => {
            console.error(`[${name}] Timed out! Killing process...`);
            child.kill('SIGKILL');
            reject(new Error('Timeout'));
        }, TIMEOUT_MS);

        child.on('exit', (code) => {
            clearTimeout(timer);
            if (code === 0) {
                console.log(`[${name}] Finished successfully.`);
                resolve();
            } else {
                console.error(`[${name}] Exited with code ${code}.`);
                reject(new Error(`Exit code ${code}`));
            }
        });

        child.on('error', (err) => {
            clearTimeout(timer);
            console.error(`[${name}] Error: ${err.message}`);
            reject(err);
        });
    });
}

async function main() {
    if (!process.env.DEEPSEEK_API_KEY) {
        console.error('DEEPSEEK_API_KEY is not set. Skipping tests.');
        process.exit(0);
    }

    const testDir = join(cwd(), 'temp_deepseek_test');
    if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
    }
    mkdirSync(testDir);

    // Initialize git repo to avoid aider confusion with parent repo
    // and to allow aider to track files
    spawn('git', ['init'], { cwd: testDir, stdio: 'ignore' });
    spawn('git', ['config', 'user.email', 'you@example.com'], { cwd: testDir, stdio: 'ignore' });
    spawn('git', ['config', 'user.name', 'Your Name'], { cwd: testDir, stdio: 'ignore' });


    console.log(`Testing in directory: ${testDir}`);

    const scriptPath = (agentFile: string) => join(cwd(), 'src', 'agents', agentFile);

    // Test deepseek_aider
    try {
        // Aider might hang if not careful. We pass --yes to confirm changes.
        // Also passing /exit via pipe is tricky with inherit stdio, but let's try just arguments first.
        // Note: src/agents/deepseek_aider.ts takes args: [message, ...files]
        // We pass "Create aider.txt..." as message, and --yes as a file argument (which aider might interpret as a flag if passed correctly).
        // However, the wrapper logic: arguments after message are files.
        // If we want to pass flags to aider, we might need to rely on aider parsing them even if they look like files to the wrapper.
        await runAgent('deepseek_aider', 'npx', ['tsx', scriptPath('deepseek_aider.ts'), "Create a file named aider.txt with content 'Hello from Aider'", "--yes"], testDir);
    } catch (e) {
        console.error('deepseek_aider failed:', e);
    }

    // Test deepseek_claude
    try {
        // Pass --dangerously-skip-permissions to allow tool execution without prompt
        // and -p to run in non-interactive mode (print and exit)
        await runAgent('deepseek_claude', 'npx', ['tsx', scriptPath('deepseek_claude.ts'), "Create a file named claude.txt with content 'Hello from Claude'", "--dangerously-skip-permissions", "-p"], testDir);
    } catch (e) {
        console.error('deepseek_claude failed:', e);
    }

    // Test deepseek_opencode (Disabled due to missing package)
    // try {
    //    await runAgent('deepseek_opencode', 'npx', ['tsx', scriptPath('deepseek_opencode.ts'), "Create a file named opencode.txt with content 'Hello from OpenCode'"], testDir);
    // } catch (e) {
    //    console.error('deepseek_opencode failed:', e);
    // }

    // Verification
    console.log('\n--- Verification ---');
    const verifyFile = (filename: string, expectedContent: string) => {
        const filePath = join(testDir, filename);
        if (existsSync(filePath)) {
            const content = readFileSync(filePath, 'utf-8');
            if (content.includes(expectedContent)) {
                console.log(`[PASS] ${filename} created with correct content.`);
            } else {
                console.error(`[FAIL] ${filename} created but content mismatch. Found: "${content}"`);
            }
        } else {
            console.error(`[FAIL] ${filename} was NOT created.`);
        }
    };

    verifyFile('aider.txt', 'Hello from Aider');
    verifyFile('claude.txt', 'Hello from Claude');
    // verifyFile('opencode.txt', 'Hello from OpenCode');

    // Cleanup
    // rmSync(testDir, { recursive: true, force: true });
}

main().catch(console.error);
