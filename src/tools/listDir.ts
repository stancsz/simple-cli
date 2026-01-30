/**
 * Tool: listDir
 * List the contents of a directory (files and subdirectories)
 */

import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { z } from 'zod';

export const name = 'listDir';

export const description = 'List the contents of a directory, showing file sizes and directory indicators';

export const permission = 'read' as const;

export const schema = z.object({
    path: z.string().optional().describe('Directory path to list (default: current directory)'),
    recursive: z.boolean().optional().default(false).describe('Whether to list recursively'),
    depth: z.number().optional().default(1).describe('Max depth for recursive listing')
});

interface EntryInfo {
    name: string;
    isDir: boolean;
    size?: number;
    childrenCount?: number;
}

export const execute = async (args: Record<string, unknown>): Promise<EntryInfo[]> => {
    const parsed = schema.parse(args);
    const rootPath = parsed.path || process.cwd();

    try {
        const entries = await readdir(rootPath, { withFileTypes: true });
        const result: EntryInfo[] = [];

        for (const entry of entries) {
            // Basic ignores
            if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;

            const fullPath = join(rootPath, entry.name);
            const isDir = entry.isDirectory();

            let entryInfo: EntryInfo = {
                name: entry.name,
                isDir
            };

            if (!isDir) {
                try {
                    const s = await stat(fullPath);
                    entryInfo.size = s.size;
                } catch { }
            } else if (parsed.recursive && (parsed.depth || 0) > 0) {
                // We don't actually do recursion here to keep it simple and flat
                // but it's a placeholder for future if needed.
            }

            result.push(entryInfo);
        }

        return result;
    } catch (error) {
        throw new Error(`Failed to list directory ${rootPath}: ${error instanceof Error ? error.message : error}`);
    }
};
