/**
 * Tool: write_to_file
 * Simplified file write for single files
 */
import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve } from 'path';
import { z } from 'zod';

export const name = 'write_to_file';
export const description = 'Write content to a single file. Overwrites if it exists.';
export const permission = 'write' as const;

export const schema = z.object({
    path: z.string().describe('File path to write'),
    content: z.string().describe('Content to write')
});

export const execute = async (args: Record<string, unknown>): Promise<string> => {
    const { path, content } = schema.parse(args);
    const absPath = resolve(path);
    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, content, 'utf-8');
    return `Successfully wrote to ${path}`;
};
