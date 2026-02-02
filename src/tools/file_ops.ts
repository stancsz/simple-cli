/**
 * Tool: move_file
 * Move or rename files safely
 */

import { rename, stat, mkdir } from 'fs/promises';
import { resolve, dirname } from 'path';
import { z } from 'zod';
import { existsSync } from 'fs';

export const name = 'move_file';

export const description = 'Move or rename a file from source to destination. Creates destination directory if it does not exist.';

export const permission = 'write' as const;

export const schema = z.object({
    source: z.string().describe('Source file path'),
    destination: z.string().describe('Destination file path'),
    overwrite: z.boolean().optional().default(false).describe('Overwrite if destination exists')
});

type MoveFileArgs = z.infer<typeof schema>;

export const execute = async (args: Record<string, unknown>): Promise<string> => {
    const { source, destination, overwrite } = schema.parse(args);

    const srcPath = resolve(source);
    const destPath = resolve(destination);

    try {
        // Check if source exists
        await stat(srcPath);
    } catch {
        throw new Error(`Source file not found: ${srcPath}`);
    }

    // Check if destination exists
    if (existsSync(destPath) && !overwrite) {
        throw new Error(`Destination already exists: ${destPath}. Set overwrite=true to force.`);
    }

    // Ensure destination directory exists
    await mkdir(dirname(destPath), { recursive: true });

    try {
        await rename(srcPath, destPath);
        return `Successfully moved ${source} to ${destination}`;
    } catch (error) {
        // If cross-device link error (EXDEV), we might need copy+unlink, but Node's rename usually handles this or throws.
        // For simplicity in this tool, we report the error.
        throw new Error(`Failed to move file: ${error instanceof Error ? error.message : String(error)}`);
    }
};
