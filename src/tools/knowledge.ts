import { z } from 'zod';
import { readFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, resolve } from 'path';
import { homedir } from 'os';
import type { Tool } from '../registry.js';

export const inputSchema = z.object({
  action: z.enum(['list', 'read', 'search']).describe('Action to perform'),
  query: z.string().optional().describe('Search query (required for search action)'),
  path: z.string().optional().describe('File path or name (required for read action)'),
});

type KnowledgeInput = z.infer<typeof inputSchema>;

const GLOBAL_KNOWLEDGE_DIR = join(homedir(), '.simple', 'knowledge');
const LOCAL_KNOWLEDGE_DIR = join(process.cwd(), 'knowledge');

async function getFiles(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  try {
    const files = await readdir(dir, { withFileTypes: true });
    // Only return markdown files
    return files
      .filter(dirent => dirent.isFile() && dirent.name.endsWith('.md'))
      .map(dirent => join(dir, dirent.name));
  } catch {
    return [];
  }
}

export async function execute(input: KnowledgeInput): Promise<string> {
  const { action, query, path } = inputSchema.parse(input);

  const globalFiles = await getFiles(GLOBAL_KNOWLEDGE_DIR);
  const localFiles = await getFiles(LOCAL_KNOWLEDGE_DIR);
  const allFiles = [...localFiles, ...globalFiles];

  if (action === 'list') {
    if (allFiles.length === 0) {
      return 'No knowledge files found in local (knowledge/) or global (~/.simple/knowledge/) directories.';
    }
    const localNames = localFiles.map(f => `[Local] ${basename(f)}`);
    const globalNames = globalFiles.map(f => `[Global] ${basename(f)}`);
    return `Available Knowledge:\n${[...localNames, ...globalNames].join('\n')}`;
  }

  if (action === 'read') {
    if (!path) return 'Error: Path required for read action.';

    // Try to find the file
    let targetFile = path;

    // If it's not an absolute path or existing relative path, search in our lists
    if (!existsSync(targetFile)) {
       const found = allFiles.find(f => basename(f) === path || f.endsWith(path));
       if (found) {
         targetFile = found;
       } else {
         return `Error: File not found: ${path}`;
       }
    }

    // Security check: Ensure file is within knowledge directories
    const resolvedPath = resolve(targetFile);
    const resolvedGlobal = resolve(GLOBAL_KNOWLEDGE_DIR);
    const resolvedLocal = resolve(LOCAL_KNOWLEDGE_DIR);

    if (!resolvedPath.startsWith(resolvedGlobal) && !resolvedPath.startsWith(resolvedLocal)) {
      return `Error: Access denied. Can only read files from knowledge directories. Path: ${path}`;
    }

    try {
      const content = await readFile(targetFile, 'utf-8');
      return `### ${basename(targetFile)}\n\n${content}`;
    } catch (error) {
      return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  if (action === 'search') {
    if (!query) return 'Error: Query required for search action.';

    const results: string[] = [];
    const lowerQuery = query.toLowerCase();

    for (const file of allFiles) {
      try {
        const content = await readFile(file, 'utf-8');
        if (content.toLowerCase().includes(lowerQuery)) {
           // Simple snippet extraction: find lines with the query
           const lines = content.split('\n');
           const matchingLines = lines
             .map((line, index) => ({ line, index }))
             .filter(({ line }) => line.toLowerCase().includes(lowerQuery));

           // Take first 3 matches
           const snippet = matchingLines.slice(0, 3)
             .map(m => `Line ${m.index + 1}: ${m.line.trim()}`)
             .join('\n');

           results.push(`File: ${basename(file)} (${file.startsWith(homedir()) ? 'Global' : 'Local'})\n${snippet}...`);
        }
      } catch {
        continue;
      }
    }

    if (results.length === 0) return `No matches found for "${query}".`;
    return `Search Results:\n\n${results.join('\n\n')}`;
  }

  return 'Invalid action.';
}

export const tool: Tool = {
  name: 'knowledge',
  description: 'Manage knowledge base. Search, read, and list technical briefs and mission archives from local (knowledge/) and global (~/.simple/knowledge/) directories.',
  inputSchema,
  permission: 'read',
  execute: async (args) => execute(args as KnowledgeInput),
};
