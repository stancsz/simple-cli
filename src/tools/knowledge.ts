/**
 * Knowledge Tool - Deep retrieval of past mission archives and technical briefs
 */
import { z } from 'zod';
import { readFile, readdir, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../registry.js';
import { KnowledgeBase } from '../lib/knowledge.js';

export const inputSchema = z.object({
    action: z.enum(['search', 'get_brief', 'list_archives', 'add_pattern', 'list_patterns']),
    query: z.string().optional().describe('Search query for past missions, technical facts, or patterns'),
    archiveName: z.string().optional().describe('Specific archive filename to retrieve'),
    content: z.string().optional().describe('Content of the pattern to add'),
    category: z.string().optional().describe('Category of the pattern'),
    tags: z.array(z.string()).optional().describe('Tags for the pattern')
});

type KnowledgeInput = z.infer<typeof inputSchema>;

export const execute = async (args: Record<string, unknown>, cwd: string = process.cwd()): Promise<any> => {
    const { action, query, archiveName, content, category, tags } = inputSchema.parse(args);
    const notesDir = join(cwd, '.simple/workdir/memory/notes');
    const kb = new KnowledgeBase(cwd);

    switch (action) {
        case 'add_pattern':
            if (!content) throw new Error('content is required for add_pattern');
            const pattern = await kb.addPattern(content, category || 'general', tags || []);
            return { success: true, pattern };

        case 'list_patterns':
            const patterns = await kb.getPatterns(query);
            return { patterns };

        case 'list_archives':
            if (!existsSync(notesDir)) return { archives: [] };
            const files = await readdir(notesDir);
            return { archives: files.filter(f => f.endsWith('.md')) };

        case 'get_brief':
            if (!archiveName) throw new Error('archiveName is required for get_brief');
            const filePath = join(notesDir, archiveName);
            if (!existsSync(filePath)) throw new Error(`Archive ${archiveName} not found`);
            const fileContent = await readFile(filePath, 'utf-8');
            return { content: fileContent };

        case 'search':
            if (!query) throw new Error('query is required for search');
            const results: any = { patterns: [], archives: [] };

            // Search Patterns
            results.patterns = await kb.getPatterns(query);

            // Search Archives
            if (existsSync(notesDir)) {
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
                results.archives = matches;
            }
            return results;

        default:
            throw new Error(`Invalid action: ${action}`);
    }
};

export const tool: Tool = {
    name: 'knowledge',
    description: 'Retrieve technical knowledge from past missions and archives. Use this to avoid repeating mistakes or to recall architectural patterns discovered previously. Can also store new patterns.',
    inputSchema,
    permission: 'write',
    execute: async (args) => execute(args as any),
};
