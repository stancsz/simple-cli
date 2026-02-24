import { readdir, readFile, writeFile, mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import { MetricsCollector } from './metrics_collector.js';

const TASKS_DIR = join(process.cwd(), 'scripts', 'benchmark', 'tasks');
const RESULTS_DIR = join(process.cwd(), 'benchmarks', 'results');
const DOCS_DATA_DIR = join(process.cwd(), 'docs', 'benchmarks');
const DASHBOARD_PUBLIC_DIR = join(process.cwd(), 'scripts', 'dashboard', 'public');
const WEBSITE_DIR = join(process.cwd(), 'website');

interface Task {
    id: string;
    name: string;
    description: string;
    prompt: string;
    files: Record<string, string>;
    validation: {
        type: string;
        file: string;
        contains?: string[];
    };
    expected_tokens: number;
}

interface BenchmarkResult {
    task: string;
    tool: string;
    duration_ms: number;
    tokens_total: number;
    cost_est: number;
    success: boolean;
    error?: string;
}

async function runCommand(command: string, args: string[], cwd: string, timeout: number = 60000): Promise<void> {
    return new Promise((resolve, reject) => {
        const env = {
            ...process.env,
            CI: 'true',
            // Ensure child process writes metrics to the main .agent directory so collector can find them
            JULES_AGENT_DIR: process.env.JULES_AGENT_DIR || join(process.cwd(), '.agent'),
            // Ensure child process finds mcp.json in the root
            MCP_CONFIG_PATH: resolve(process.cwd(), 'mcp.json'),
            // Ensure child process finds mcp.staging.json in the root
            MCP_STAGING_CONFIG_PATH: resolve(process.cwd(), 'mcp.staging.json')
        };
        const proc = spawn(command, args, { cwd, stdio: 'inherit', env });

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error('Timeout'));
        }, timeout);

        proc.on('close', (code) => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error(`Process exited with code ${code}`));
        });
    });
}

async function setupTask(task: Task, workDir: string) {
    await mkdir(workDir, { recursive: true });
    for (const [filename, content] of Object.entries(task.files)) {
        await writeFile(join(workDir, filename), content);
    }
}

async function validateTask(task: Task, workDir: string): Promise<boolean> {
    try {
        if (task.validation.type === 'file_content') {
            const content = await readFile(join(workDir, task.validation.file), 'utf-8');
            if (task.validation.contains) {
                return task.validation.contains.every(s => content.includes(s));
            }
        } else if (task.validation.type === 'file_exists') {
            // Check if file exists (implicit in readFile if we tried)
            // But if we just check existence:
            try {
                await readFile(join(workDir, task.validation.file));
                return true;
            } catch {
                return false;
            }
        }
        return true;
    } catch (e) {
        return false;
    }
}

async function runBenchmark() {
    console.log("Starting Benchmark Suite...");

    // Parse args
    const args = process.argv.slice(2);
    const taskIdFilter = args.find((arg, i) => args[i-1] === '--task');

    // Ensure directories exist
    await mkdir(RESULTS_DIR, { recursive: true });
    await mkdir(DOCS_DATA_DIR, { recursive: true });

    const taskFiles = await readdir(TASKS_DIR);
    const results: BenchmarkResult[] = [];
    const timestamp = new Date().toISOString();

    for (const file of taskFiles) {
        if (!file.endsWith('.json')) continue;

        const task: Task = JSON.parse(await readFile(join(TASKS_DIR, file), 'utf-8'));

        if (taskIdFilter && task.id !== taskIdFilter) continue;

        console.log(`Running task: ${task.name} (${task.id})`);

        const workDir = join(process.cwd(), 'temp_benchmark', task.id);

        // 1. Run Simple-CLI
        try {
            // Ensure temp dir is clean
            if (await import('fs').then(m => m.existsSync(workDir))) {
                 await rm(workDir, { recursive: true, force: true });
            }
            await setupTask(task, workDir);

            const collector = new MetricsCollector();
            collector.start();

            // Run CLI in non-interactive mode
            // We use 'npx tsx' to run directly from source
            // We run from ROOT (process.cwd()) and pass workDir as an argument to change context
            const cliPath = join(process.cwd(), 'src', 'cli.ts');

            // Pass workDir, prompt, and non-interactive flag
            // Note: src/cli.ts treats directory args as CWD change
            await runCommand('npx', ['tsx', cliPath, workDir, task.prompt, '--non-interactive'], process.cwd(), 120000);

            // Wait for file system flush
            await new Promise(r => setTimeout(r, 1000));

            const metrics = await collector.stop();
            const success = await validateTask(task, workDir);

            results.push({
                task: task.id,
                tool: 'Simple-CLI',
                duration_ms: metrics.duration_ms,
                tokens_total: metrics.tokens_total,
                cost_est: metrics.cost_est,
                success
            });

        } catch (e: any) {
            console.error(`Simple-CLI failed on ${task.id}:`, e);
            results.push({
                task: task.id,
                tool: 'Simple-CLI',
                duration_ms: 0,
                tokens_total: 0,
                cost_est: 0,
                success: false,
                error: e.message
            });
        }

        // 2. Mock Competitors (Aider, Cursor)
        // Simulate slightly worse performance for demonstration
        results.push({
            task: task.id,
            tool: 'Aider (Simulated)',
            duration_ms: (results[results.length - 1].duration_ms || 10000) * 1.2, // 20% slower
            tokens_total: (results[results.length - 1].tokens_total || 1000) * 1.5, // 50% more tokens
            cost_est: (results[results.length - 1].cost_est || 0.01) * 1.5,
            success: true
        });

        results.push({
            task: task.id,
            tool: 'Cursor (Simulated)',
            duration_ms: (results[results.length - 2].duration_ms || 10000) * 0.8, // 20% faster
            tokens_total: (results[results.length - 2].tokens_total || 1000) * 1.1, // 10% more tokens
            cost_est: (results[results.length - 2].cost_est || 0.01) * 1.1,
            success: true
        });

        // Cleanup
        await rm(workDir, { recursive: true, force: true });
    }

    const output = {
        timestamp,
        results
    };

    // Save outputs
    await writeFile(join(RESULTS_DIR, 'latest.json'), JSON.stringify(output, null, 2));
    await writeFile(join(DOCS_DATA_DIR, 'data.json'), JSON.stringify(output, null, 2));

    // Copy to dashboard public dir
    await mkdir(DASHBOARD_PUBLIC_DIR, { recursive: true });
    await writeFile(join(DASHBOARD_PUBLIC_DIR, 'benchmarks.json'), JSON.stringify(output, null, 2));

    console.log("Benchmark Suite Completed.");
    console.log(`Results: ${join(RESULTS_DIR, 'latest.json')}`);
}

runBenchmark().catch(console.error);
