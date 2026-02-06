/**
 * Knowledge Tool - Provides access to shared business context
 * Scans 'knowledge/' (local) and '~/.simple/knowledge/' (global)
 */

import { z } from 'zod';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve, extname, basename } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { Tool } from '../registry.js';

export const name = 'knowledge_tool';
export const description = 'Access the shared knowledge base (business context). Use this to list, read, or search documents in the knowledge repository.';
export const permission = 'read' as const;

export const inputSchema = z.object({
  action: z.enum(['list', 'read', 'search']).describe('Action to perform'),
  query: z.string().optional().describe('Search query or filename to read'),
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
          // Local takes precedence if duplicates
          if (!files.has(item)) {
            files.set(item, join(dir, item));
          }
        }
      }
    } catch { /* ignore */ }
  }
  return files;
}

export async function execute(args: Record<string, unknown>): Promise<string> {
  const { action, query } = inputSchema.parse(args);

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
      // Try fuzzy match
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
    const files = await getAllFiles();
    const results: string[] = [];

    for (const [name, path] of files) {
      try {
        const content = await readFile(path, 'utf-8');
        if (content.toLowerCase().includes(query.toLowerCase())) {
          // Simple snippet extraction
          const idx = content.toLowerCase().indexOf(query.toLowerCase());
          const start = Math.max(0, idx - 50);
          const end = Math.min(content.length, idx + 100);
          const snippet = content.slice(start, end).replace(/\n/g, ' ');
          results.push(`- [${name}]: "...${snippet}..."`);
        }
      } catch { /* skip */ }
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
