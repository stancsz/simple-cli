/**
 * Knowledge Tool - Deep retrieval of past mission archives and technical briefs
 */
import { z } from 'zod';
import { readFile, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../registry.js';

export const inputSchema = z.object({
    action: z.enum(['search', 'get_brief', 'list_archives']),
    query: z.string().optional().describe('Search query for past missions or technical facts'),
    archiveName: z.string().optional().describe('Specific archive filename to retrieve')
});

type KnowledgeInput = z.infer<typeof inputSchema>;

export const execute = async (args: Record<string, unknown>, cwd: string = process.cwd()): Promise<any> => {
    const { action, query, archiveName } = inputSchema.parse(args);
    const notesDir = join(cwd, '.simple/workdir/memory/notes');

    switch (action) {
        case 'list_archives':
            if (!existsSync(notesDir)) return { archives: [] };
            const files = await readdir(notesDir);
            return { archives: files.filter(f => f.endsWith('.md')) };

        case 'get_brief':
            if (!archiveName) throw new Error('archiveName is required for get_brief');
            const filePath = join(notesDir, archiveName);
            if (!existsSync(filePath)) throw new Error(`Archive ${archiveName} not found`);
            const content = await readFile(filePath, 'utf-8');
            return { content };

        case 'search':
            if (!query) throw new Error('query is required for search');
            if (!existsSync(notesDir)) return { matches: [] };
            
            const allFiles = await readdir(notesDir);
            const matches: any[] = [];
            const queryLower = query.toLowerCase();

            for (const file of allFiles.filter(f => f.endsWith('.md'))) {
                const text = await readFile(join(notesDir, file), 'utf-8');
                if (text.toLowerCase().includes(queryLower)) {
                    matches.push({
                        file,
                        snippet: text.slice(0, 200) + '...'
                    });
                }
            }
            return { query, matches };

        default:
            throw new Error(`Invalid action: ${action}`);
    }
};

export const tool: Tool = {
    name: 'knowledge',
    description: 'Retrieve technical knowledge from past missions and archives. Use this to avoid repeating mistakes or to recall architectural patterns discovered previously.',
    inputSchema,
    permission: 'read',
    execute: async (args) => execute(args as any),
};
