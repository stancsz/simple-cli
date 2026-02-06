/**
 * Knowledge Tool - Unified access to business context, shared knowledge, and mission archives.
 * Scans 'knowledge/' (local), '~/.simple/knowledge/' (global), and '.simple/workdir/memory/notes' (archives).
 */

import { z } from 'zod';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve, basename } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { Tool } from '../registry.js';

export const name = 'knowledge';
export const description = 'Access the shared knowledge base (business context) and past mission archives. Use this to list, read, or search documents to gain context.';
export const permission = 'read' as const;

export const inputSchema = z.object({
  action: z.enum(['list', 'read', 'search', 'list_archives', 'get_brief']).describe('Action to perform'),
  query: z.string().optional().describe('Search query, or filename to read'),
  archiveName: z.string().optional().describe('Specific archive filename to retrieve (for get_brief)'),
});

type KnowledgeInput = z.infer<typeof inputSchema>;

async function getKnowledgeDirs(): Promise<string[]> {
  const dirs: string[] = [];

  // Local project knowledge
  const local = resolve(process.cwd(), 'knowledge');
  if (existsSync(local) && (await stat(local)).isDirectory()) {
    dirs.push(local);
  }

  // Global simple knowledge
  const global = join(homedir(), '.simple', 'knowledge');
  if (existsSync(global) && (await stat(global)).isDirectory()) {
    dirs.push(global);
  }

  return dirs;
}

async function getAllFiles(): Promise<Map<string, string>> {
  const dirs = await getKnowledgeDirs();
  const files = new Map<string, string>(); // filename -> fullPath

  for (const dir of dirs) {
    try {
      const items = await readdir(dir);
      for (const item of items) {
        if (item.endsWith('.md') || item.endsWith('.txt')) {
          if (!files.has(item)) {
            files.set(item, join(dir, item));
          }
        }
      }
    } catch { /* ignore */ }
  }
  return files;
}

export async function execute(args: Record<string, unknown>): Promise<any> {
  const { action, query, archiveName } = inputSchema.parse(args);
  const cwd = process.cwd();
  const notesDir = join(cwd, '.simple/workdir/memory/notes');

  // Archive Actions (Frontier Mode)
  if (action === 'list_archives') {
    if (!existsSync(notesDir)) return { archives: [] };
    const files = await readdir(notesDir);
    return { archives: files.filter(f => f.endsWith('.md')) };
  }

  if (action === 'get_brief') {
    if (!archiveName) throw new Error('archiveName is required for get_brief');
    const filePath = join(notesDir, archiveName);
    if (!existsSync(filePath)) throw new Error(`Archive ${archiveName} not found`);
    const content = await readFile(filePath, 'utf-8');
    return { content };
  }

  // Standard Knowledge Actions
  if (action === 'list') {
    const files = await getAllFiles();
    if (files.size === 0) {
      return 'No knowledge files found in knowledge/ or ~/.simple/knowledge/.';
    }
    return `Available Knowledge Documents:\n${Array.from(files.keys()).map(f => `- ${f}`).join('\n')}`;
  }

  if (action === 'read') {
    if (!query) return 'Error: Filename required for "read" action.';
    const files = await getAllFiles();
    const fullPath = files.get(query);

    if (!fullPath) {
      const match = Array.from(files.keys()).find(f => f.toLowerCase().includes(query.toLowerCase()));
      if (match) {
        const content = await readFile(files.get(match)!, 'utf-8');
        return `## ${match}\n\n${content}`;
      }
      return `Error: Document "${query}" not found.`;
    }

    const content = await readFile(fullPath, 'utf-8');
    return `## ${query}\n\n${content}`;
  }

  if (action === 'search') {
    if (!query) return 'Error: Query required for "search" action.';
    
    // Search Knowledge Base
    const files = await getAllFiles();
    const results: string[] = [];

    for (const [name, path] of files) {
      try {
        const content = await readFile(path, 'utf-8');
        if (content.toLowerCase().includes(query.toLowerCase())) {
          const idx = content.toLowerCase().indexOf(query.toLowerCase());
          const start = Math.max(0, idx - 50);
          const end = Math.min(content.length, idx + 100);
          const snippet = content.slice(start, end).replace(/\n/g, ' ');
          results.push(`- [KB:${name}]: "...${snippet}..."`);
        }
      } catch { /* skip */ }
    }

    // Search Mission Archives (Frontier)
    if (existsSync(notesDir)) {
         const archiveFiles = await readdir(notesDir);
         for (const file of archiveFiles.filter(f => f.endsWith('.md'))) {
             try {
                 const text = await readFile(join(notesDir, file), 'utf-8');
                 if (text.toLowerCase().includes(query.toLowerCase())) {
                     results.push(`- [ARCHIVE:${file}]: "...found match in archive..."`);
                 }
             } catch {}
         }
    }

    if (results.length === 0) return `No matches found for "${query}".`;
    return `Search Results:\n${results.join('\n')}`;
  }

  return 'Unknown action.';
}

export const tool: Tool = {
  name,
  description,
  inputSchema,
  permission,
  execute: async (args) => execute(args as KnowledgeInput),
};
