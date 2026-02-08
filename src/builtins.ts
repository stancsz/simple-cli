import { readFile, writeFile, readdir, unlink, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, relative, extname } from 'path';
import { exec, spawn, execSync, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';
import glob from 'fast-glob';
import { Scheduler } from './scheduler.js';

const execAsync = promisify(exec);
const activeProcesses: ChildProcess[] = [];

export const cleanupProcesses = () => {
    for (const proc of activeProcesses) {
        if (!proc.killed && proc.pid) {
            if (process.platform === 'win32') {
                try {
                    execSync(`taskkill /F /T /PID ${proc.pid}`);
                } catch {
                    proc.kill('SIGTERM');
                }
            } else {
                proc.kill('SIGTERM');
            }
        }
    }
};

// Handle cleanup on exit
process.on('exit', cleanupProcesses);
process.on('SIGINT', () => {
    cleanupProcesses();
    process.exit();
});
process.on('SIGTERM', () => {
    cleanupProcesses();
    process.exit();
});

export const readFiles = {
    name: 'read_files',
    description: 'Read contents of one or more files',
    inputSchema: z.object({ paths: z.array(z.string()) }),
    execute: async (args: any) => {
        let paths = args.paths;
        if (!paths) {
            if (args.path) paths = [args.path];
            else if (args.file) paths = [args.file];
            else if (args.filename) paths = [args.filename];
        }

        if (!paths || !Array.isArray(paths)) {
            return [{ error: "Invalid arguments: 'paths' array is required." }];
        }

        const results = [];
        for (const p of paths) {
            try {
                if (existsSync(p)) {
                    const content = await readFile(p, 'utf-8');
                    results.push({ path: p, content });
                } else {
                    results.push({ path: p, error: `File not found: ${p}` });
                }
            } catch (e: any) {
                results.push({ path: p, error: e.message });
            }
        }
        return results;
    }
};

export const writeFiles = {
    name: 'write_files',
    description: 'Write or modify files. Use SEARCH/REPLACE blocks for partial edits.',
    inputSchema: z.object({
        files: z.array(z.object({
            path: z.string(),
            content: z.string().optional(),
            searchReplace: z.array(z.object({
                search: z.string(),
                replace: z.string()
            })).optional()
        }))
    }),
    execute: async (args: any) => {
        let files = args.files;
        // Fallback: if agent passed single file attributes directly
        if (!files) {
            if (args.path) files = [args];
            else if (args.file) files = [{ ...args, path: args.file }];
            else if (args.filename) files = [{ ...args, path: args.filename }];
        } else if (typeof files === 'object' && !Array.isArray(files)) {
            // Handle dictionary format: { "file.txt": { content: "..." } }
            files = Object.entries(files).map(([key, val]: [string, any]) => ({
                path: key,
                ...val
            }));
        }

        if (!files || !Array.isArray(files)) {
            throw new Error(`Invalid arguments for write_files: ${JSON.stringify(args)}`);
        }

        const results = [];
        for (const f of files) {
            // Fix: Map 'name' to 'path' if path is missing (common hallucination)
            if (!f.path && f.name) f.path = f.name;

            try {
                if (!f.path) {
                    results.push({ success: false, message: 'File path missing' });
                    continue;
                }
                const dir = resolve(f.path, '..');
                if (!existsSync(dir)) {
                    await mkdir(dir, { recursive: true });
                }

                if (f.content !== undefined) {
                    await writeFile(f.path, f.content);
                    results.push({ path: f.path, success: true });
                } else if (f.searchReplace) {
                    if (!existsSync(f.path)) {
                        results.push({ path: f.path, success: false, message: `File not found: ${f.path}` });
                        continue;
                    }
                    let content = await readFile(f.path, 'utf-8');
                    for (const { search, replace } of f.searchReplace) {
                        if (!content.includes(search)) {
                            throw new Error(`Search pattern not found in ${f.path}: "${search}"`);
                        }
                        content = content.split(search).join(replace);
                    }
                    await writeFile(f.path, content);
                    results.push({ path: f.path, success: true });
                } else {
                    results.push({ path: f.path, success: false, message: 'No content or searchReplace provided' });
                }
            } catch (e: any) {
                results.push({ path: f.path, success: false, message: e.message });
            }
        }
        return results;
    }
};

export const createTool = {
    name: 'create_tool',
    description: 'Create a new tool from a script file',
    inputSchema: z.object({
        source_path: z.string(),
        name: z.string(),
        description: z.string(),
        usage: z.string(),
        scope: z.enum(['local', 'global']).default('local')
    }),
    execute: async ({ source_path, name, description, usage, scope }: { source_path: string, name: string, description: string, usage: string, scope: string }) => {
        if (!existsSync(source_path)) return `Source file not found: ${source_path}`;

        const content = await readFile(source_path, 'utf-8');
        const ext = extname(source_path);
        const filename = `${name}${ext}`;

        let header = '';
        if (ext === '.js' || ext === '.ts') {
            header = `/**\n * ${name}\n * ${description}\n * Usage: ${usage}\n */\n\n`;
        } else if (ext === '.py') {
            header = `"""\n${name}\n${description}\nUsage: ${usage}\n"""\n\n`;
        }

        const targetDir = scope === 'global'
            ? join(process.env.HOME || process.cwd(), '.agent', 'tools')
            : join(process.cwd(), '.agent', 'tools');

        await mkdir(targetDir, { recursive: true });
        const targetPath = join(targetDir, filename);

        await writeFile(targetPath, header + content);
        return `Tool ${name} successfully saved to ${targetPath}`;
    }
};

export const scrapeUrl = {
    name: 'scrape_url',
    description: 'Scrape content from a URL',
    inputSchema: z.object({
        url: z.string().url(),
        convertToMarkdown: z.boolean().default(true),
        timeout: z.number().optional()
    }),
    execute: async ({ url, convertToMarkdown, timeout }: { url: string, convertToMarkdown: boolean, timeout?: number }) => {
        try {
            const controller = new AbortController();
            const id = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;

            let res;
            try {
                res = await fetch(url, { signal: controller.signal });
            } finally {
                if (id) clearTimeout(id);
            }

            if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
            const type = res.headers.get('content-type') || '';
            let content = await res.text();

            if (convertToMarkdown && type.includes('text/html')) {
                content = content
                    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "")
                    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "")
                    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n')
                    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n')
                    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n')
                    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n')
                    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
                    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
                    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
                    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
                    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
                    .replace(/<[^>]+>/g, '')
                    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
                    .trim();
            }
            return { url, content, contentType: type };
        } catch (e: any) {
            return { url, error: e.message };
        }
    }
};

export const listFiles = {
    name: 'list_files',
    description: 'List files using glob patterns. Supports recursive matching.',
    inputSchema: z.object({
        pattern: z.string().describe('Glob pattern (e.g. **/*.ts)'),
        path: z.string().default('.').describe('Base directory'),
        ignore: z.array(z.string()).default(['**/node_modules/**', '**/.git/**']),
        includeDirectories: z.boolean().default(false),
        maxResults: z.number().optional()
    }),
    execute: async ({ pattern, path, ignore, includeDirectories, maxResults }: { pattern: string, path: string, ignore: string[], includeDirectories: boolean, maxResults?: number }) => {
        const files = await glob(pattern, {
            cwd: path,
            ignore: ignore,
            onlyFiles: !includeDirectories,
            dot: true,
            absolute: false
        });

        const truncated = maxResults && files.length > maxResults;
        const resultFiles = maxResults ? files.slice(0, maxResults) : files;

        return {
            matches: resultFiles,
            count: resultFiles.length,
            truncated: !!truncated
        };
    }
};

export const searchFiles = {
    name: 'search_files',
    description: 'Search for patterns in files (grep-like).',
    inputSchema: z.object({
        pattern: z.string().describe('Regex pattern to search for'),
        path: z.string().default('.').describe('Directory or file to search'),
        glob: z.string().default('**/*').describe('Glob pattern to filter files'),
        ignoreCase: z.boolean().default(false),
        contextLines: z.number().default(0),
        maxResults: z.number().optional(),
        filesOnly: z.boolean().default(false)
    }),
    execute: async ({ pattern, path, glob: globPattern, ignoreCase, contextLines, maxResults, filesOnly }: { pattern: string, path: string, glob: string, ignoreCase: boolean, contextLines: number, maxResults?: number, filesOnly: boolean }) => {
        let files: string[] = [];
        try {
            const stats = await stat(path);
            if (stats.isFile()) {
                files = [path];
            } else {
                files = await glob(globPattern, {
                    cwd: path,
                    ignore: ['**/node_modules/**', '**/.git/**'],
                    onlyFiles: true,
                    absolute: true
                });
            }
        } catch (e) {
            return { matches: [], count: 0, error: 'Path not found' };
        }

        const lineRegex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');
        const matches = [];
        const matchedFiles = new Set<string>();
        let count = 0;
        let truncated = false;

        for (const file of files) {
            try {
                const content = await readFile(file, 'utf-8');
                if (content.includes('\0')) continue;

                if (filesOnly) {
                    lineRegex.lastIndex = 0;
                    if (lineRegex.test(content)) {
                        matchedFiles.add(relative(process.cwd(), file));
                        if (maxResults && matchedFiles.size >= maxResults) {
                            truncated = true;
                            break;
                        }
                    }
                    continue;
                }

                const lines = content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    lineRegex.lastIndex = 0;
                    const matchesOnLine = [...line.matchAll(lineRegex)];

                    for (const m of matchesOnLine) {
                        if (maxResults && count >= maxResults) {
                            truncated = true;
                            break;
                        }

                        const match: any = {
                            file: relative(process.cwd(), file),
                            line: i + 1,
                            text: line,
                            match: m[0]
                        };

                        if (contextLines > 0) {
                            match.contextBefore = lines.slice(Math.max(0, i - contextLines), i);
                            match.contextAfter = lines.slice(i + 1, i + 1 + contextLines);
                        }

                        matches.push(match);
                        matchedFiles.add(match.file);
                        count++;
                    }
                    if (truncated) break;
                }
            } catch (e) {
                // Ignore read errors
            }
            if (truncated) break;
        }

        return {
            matches: matches,
            count: filesOnly ? matchedFiles.size : matches.length,
            files: Array.from(matchedFiles),
            truncated: !!truncated
        };
    }
};

export const listDir = {
    name: 'list_dir',
    description: 'List contents of a directory',
    inputSchema: z.object({ path: z.string().default('.') }),
    execute: async ({ path }: { path: string }) => {
        const items = await readdir(path, { withFileTypes: true });
        return items.map(i => ({ name: i.name, isDir: i.isDirectory() }));
    }
};

export const runCommand = {
    name: 'run_command',
    description: 'Run a shell command. Use background: true for servers or long-running tasks.',
    inputSchema: z.object({
        command: z.string(),
        timeout: z.number().optional(),
        background: z.boolean().default(false).describe('Run command in background and return immediately')
    }),
    execute: async ({ command, timeout, background }: { command: string, timeout?: number, background: boolean }) => {
        if (background) {
            const child = spawn(command, {
                shell: true,
                detached: true,
                stdio: 'ignore'
            });
            child.unref();
            activeProcesses.push(child);
            return {
                message: `Started background process: ${command}`,
                pid: child.pid,
                success: true
            };
        }

        try {
            const { stdout, stderr } = await execAsync(command, { timeout });
            return { stdout, stderr, exitCode: 0, timedOut: false };
        } catch (e: any) {
            const timedOut = e.killed && e.signal === 'SIGTERM';
            return {
                error: e.message,
                stdout: e.stdout || '',
                stderr: e.stderr || '',
                exitCode: e.code || 1,
                timedOut
            };
        }
    }
};

export const stopCommand = {
    name: 'stop_command',
    description: 'Stop a background process by its PID',
    inputSchema: z.object({ pid: z.number() }),
    execute: async ({ pid }: { pid: number }) => {
        if (process.platform === 'win32') {
            try {
                await execAsync(`taskkill /F /T /PID ${pid}`);
                return `Successfully stopped process ${pid}`;
            } catch (e: any) {
                return `Error stopping process ${pid}: ${e.message}`;
            }
        } else {
            try {
                process.kill(pid, 'SIGTERM');
                return `Sent SIGTERM to process ${pid}`;
            } catch (e: any) {
                return `Error stopping process ${pid}: ${e.message}`;
            }
        }
    }
};

export const deleteFile = {
    name: 'delete_file',
    description: 'Delete a file',
    inputSchema: z.object({ path: z.string() }),
    execute: async (args: any) => {
        const path = args.path || args.file || args.filename;
        if (!path) return "Error: 'path' argument required";

        if (existsSync(path)) {
            await unlink(path);
            return `Deleted ${path}`;
        }
        return `File not found: ${path}`;
    }
};

export const gitTool = {
    name: 'git',
    description: 'Run git operations',
    inputSchema: z.object({
        operation: z.enum(['status', 'add', 'commit', 'diff', 'log', 'branch']),
        cwd: z.string().default('.'),
        files: z.array(z.string()).optional(),
        message: z.string().optional()
    }),
    execute: async ({ operation, cwd, files, message }: { operation: string, cwd: string, files?: string[], message?: string }) => {
        const run = async (cmd: string) => {
            try {
                const { stdout } = await execAsync(cmd, { cwd });
                return { success: true, output: stdout.trim() };
            } catch (e: any) {
                return { success: false, error: e.message };
            }
        };

        if (operation === 'status') {
            return run('git status -s');
        }
        if (operation === 'add') {
            if (!files || files.length === 0) return { success: false, error: 'No files specified for add' };
            return run(`git add ${files.join(' ')}`);
        }
        if (operation === 'commit') {
            if (!message) return { success: false, error: 'No commit message specified' };
            return run(`git commit -m "${message}"`);
        }
        if (operation === 'diff') {
            return run('git diff');
        }
        if (operation === 'log') {
            return run('git log --oneline -n 10');
        }
        if (operation === 'branch') {
            return run('git branch');
        }
        return { success: false, error: 'Unknown operation' };
    }
};

export const linter = {
    name: 'lint',
    description: 'Lint a file',
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }: { path: string }) => {
        if (!existsSync(path)) return { passed: false, errors: [{ message: 'File not found' }] };
        const ext = extname(path);
        let cmd = '';
        if (ext === '.js' || ext === '.ts') cmd = `node --check "${path}"`;
        else if (ext === '.py') cmd = `python3 -m py_compile "${path}"`;
        else if (ext === '.sh') cmd = `shellcheck "${path}"`;
        else return { passed: true, language: 'unknown', errors: [], warnings: [], output: 'No linter for this file type' };

        let language = 'unknown';
        if (ext === '.js') language = 'javascript';
        if (ext === '.ts') language = 'typescript';
        if (ext === '.py') language = 'python';
        if (ext === '.sh') language = 'shell';

        try {
            await execAsync(cmd);
            return { passed: true, language, errors: [], warnings: [], output: 'Lint passed', file: path };
        } catch (e: any) {
            const stderr = e.stderr || e.message;
            const lineMatch = stderr.match(/line\s+(\d+)/i) || stderr.match(/:(\d+):/);
            const line = lineMatch ? parseInt(lineMatch[1]) : 0;
            return { passed: false, language, errors: [{ message: stderr, line }], warnings: [], output: stderr, file: path };
        }
    }
};

// Git helpers
export const getCurrentBranch = async (cwd: string) => {
    try {
        const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd });
        return stdout.trim();
    } catch { return null; }
};

export const getChangedFiles = async (cwd: string) => {
    try {
        const { stdout: diff } = await execAsync('git diff --name-only', { cwd });
        const { stdout: untracked } = await execAsync('git ls-files --others --exclude-standard', { cwd });
        const { stdout: staged } = await execAsync('git diff --cached --name-only', { cwd });

        const all = [diff, untracked, staged].map(s => s.trim()).join('\n');
        return [...new Set(all.split('\n').filter(Boolean))];
    } catch { return []; }
};

export const getTrackedFiles = async (cwd: string) => {
    try {
        const { stdout } = await execAsync('git ls-files', { cwd });
        return stdout.trim().split('\n').filter(Boolean);
    } catch { return []; }
};

// --- Meta-Orchestrator Tools ---
export const delegate_cli = {
    name: 'delegate_cli',
    description: 'Delegate a complex task to a specialized external CLI agent (Codex, Gemini, Claude).',
    inputSchema: z.object({
        cli: z.string(),
        task: z.string()
    }),
    execute: async ({ cli, task }: { cli: string, task: string }) => {
        // --- LIVE EXECUTION ---
        try {
            console.log(`[delegate_cli] Spawning external process for ${cli}...`);

            // In a real production scenario, this would be: 
            // const cmd = cli; // e.g., 'gemini' or 'codex'

            // For this LIVE TEST, we use our local mock agent:
            const cmd = `npx tsx tests/manual_scripts/mock_cli.ts "${task}"`;

            const { stdout, stderr } = await execAsync(cmd);

            if (stderr) {
                console.warn(`[delegate_cli] Stderr: ${stderr}`);
            }

            return `[${cli} CLI (Live Process)]:\n${stdout.trim()}`;
        } catch (e: any) {
            return `[${cli} CLI]: Error executing external process: ${e.message}\nOutput: ${e.stdout || ''}\nError: ${e.stderr || ''}`;
        }
    }
};

export const schedule_task = {
    name: 'schedule_task',
    description: 'Register a recurring task to be executed by the agent autonomously.',
    inputSchema: z.object({
        cron: z.string().describe('Standard cron expression (e.g. "0 9 * * *")'),
        prompt: z.string().describe('The instruction to execute'),
        description: z.string().describe('Human-readable description')
    }),
    execute: async ({ cron, prompt, description }: { cron: string, prompt: string, description: string }) => {
        try {
            const scheduler = Scheduler.getInstance();
            const id = await scheduler.scheduleTask(cron, prompt, description);
            return `Task scheduled successfully with ID: ${id}`;
        } catch (e: any) {
            return `Failed to schedule task: ${e.message}`;
        }
    }
};

export const allBuiltins = [readFiles, writeFiles, createTool, scrapeUrl, listFiles, searchFiles, listDir, runCommand, stopCommand, deleteFile, gitTool, linter, delegate_cli, schedule_task];