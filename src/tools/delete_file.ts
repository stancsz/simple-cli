/**
 * Tool: delete_file
 * Safely delete files
 */

import { unlink, stat } from 'fs/promises';
import { resolve } from 'path';
import { z } from 'zod';
import { existsSync } from 'fs';

export const name = 'delete_file';

export const description = 'Delete a file from the filesystem. Use with caution.';

export const permission = 'write' as const;

export const schema = z.object({
    path: z.string().describe('Path to the file to delete'),
    confirm: z.boolean().optional().default(false).describe('Confirmation flag (must be true to execute)')
});

type DeleteFileArgs = z.infer<typeof schema>;

export const execute = async (args: Record<string, unknown>): Promise<string> => {
    const { path, confirm } = schema.parse(args);

    if (!confirm) {
        throw new Error('Deletion requires explicit confirmation. Set confirm=true to proceed.');
    }

    const fullPath = resolve(path);

    if (!existsSync(fullPath)) {
        throw new Error(`File not found: ${fullPath}`);
    }

    try {
        const stats = await stat(fullPath);
        if (stats.isDirectory()) {
            throw new Error(`Path is a directory, not a file: ${fullPath}. Use a different tool for directories.`);
        }

        await unlink(fullPath);
        return `Successfully deleted ${path}`;
    } catch (error) {
        throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : String(error)}`);
    }
};
