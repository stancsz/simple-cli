import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve, relative } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { z } from 'zod';

const execAsync = promisify(exec);

export const readFiles = {
    name: 'read_files',
    description: 'Read contents of one or more files',
    inputSchema: z.object({ paths: z.array(z.string()) }),
    execute: async ({ paths }: { paths: string[] }) => {
        const results: Record<string, string> = {};
        for (const p of paths) {
            if (existsSync(p)) results[p] = await readFile(p, 'utf-8');
        }
        return results;
    }
};

export const writeFiles = {
    name: 'write_files',
    description: 'Write or modify files. Use SEARCH/REPLACE blocks for partial edits.',
    inputSchema: z.object({
        files: z.array(z.object({ path: z.string(), content: z.string() }))
    }),
    execute: async ({ files }: { files: { path: string, content: string }[] }) => {
        for (const f of files) {
            await writeFile(f.path, f.content);
        }
        return 'Files written successfully';
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
    description: 'Run a shell command',
    inputSchema: z.object({ command: z.string() }),
    execute: async ({ command }: { command: string }) => {
        try {
            const { stdout, stderr } = await execAsync(command);
            return { stdout, stderr };
        } catch (e: any) {
            return { error: e.message, stdout: e.stdout, stderr: e.stderr };
        }
    }
};

export const deleteFile = {
    name: 'delete_file',
    description: 'Delete a file',
    inputSchema: z.object({ path: z.string() }),
    execute: async ({ path }: { path: string }) => {
        if (existsSync(path)) {
            await unlink(path);
            return `Deleted ${path}`;
        }
        return 'File not found';
    }
};

export const allBuiltins = [readFiles, writeFiles, listDir, runCommand, deleteFile];
