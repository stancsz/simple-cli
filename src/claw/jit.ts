import { readFile } from 'fs/promises';
import * as path from 'path';

/**
 * [Simple-CLI AI-Created]
 * Recreated file based on task description.
 */

export async function buildMemoryContext(reflectionsDir: string, files: string[]): Promise<string> {
    // Optimized: Concurrent non-blocking reads using Promise.all
    const contents = await Promise.all(files.map(async f => {
        const content = await readFile(path.join(reflectionsDir, f), 'utf-8');
        return `\n--- Previous Reflection (${f}) ---\n${content}\n`;
    }));
    return contents.join('');
}
