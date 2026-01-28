/**
 * Glob Tool - Find files matching patterns
 * Uses fast-glob for reliable glob matching (with fallback)
 */

import { z } from 'zod';
import { readdir } from 'fs/promises';
import { join, relative, basename } from 'path';
import type { Tool } from '../registry.js';

// Input schema
export const inputSchema = z.object({
  pattern: z.string().describe('Glob pattern to match files (e.g., "**/*.ts", "src/**/*.js")'),
  cwd: z.string().optional().describe('Working directory to search in'),
  maxResults: z.number().optional().default(100).describe('Maximum number of results'),
  includeDirectories: z.boolean().optional().default(false).describe('Include directories in results'),
  ignore: z.array(z.string()).optional().describe('Patterns to ignore'),
});

type GlobInput = z.infer<typeof inputSchema>;

// Default ignore patterns
const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.svn/**',
  '**/.hg/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.nuxt/**',
  '**/__pycache__/**',
  '**/.pytest_cache/**',
  '**/venv/**',
  '**/.venv/**',
  '**/env/**',
  '**/.env',
  '**/.idea/**',
  '**/.vscode/**',
  '**/*.pyc',
  '**/*.pyo',
  '**/.DS_Store',
  '**/Thumbs.db',
];

// Simple ignore patterns for fallback (directory names)
const FALLBACK_IGNORE = [
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'coverage',
  '.next', '.nuxt', '__pycache__', '.pytest_cache', 'venv', '.venv',
  'env', '.idea', '.vscode',
];

// Cached fast-glob instance (typed as any to handle missing module)
let fastGlob: any = null;
let fgLoaded = false;

async function loadFastGlob(): Promise<any> {
  if (!fgLoaded) {
    fgLoaded = true;
    try {
      fastGlob = (await import('fast-glob')).default;
    } catch {
      // fast-glob not installed
    }
  }
  return fastGlob;
}

// Convert glob pattern to regex (for fallback)
function globToRegex(pattern: string): RegExp {
  let prefix = '';
  let workPattern = pattern;
  
  if (pattern.startsWith('**/')) {
    prefix = '(?:^|.*/)?';
    workPattern = pattern.slice(3);
  }
  
  let regex = workPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');

  return new RegExp(`${prefix}${regex}$`, 'i');
}

// Fallback: recursive file finder
async function findFilesFallback(
  dir: string,
  pattern: RegExp,
  options: {
    maxResults: number;
    includeDirectories: boolean;
    ignorePatterns: string[];
    baseDir: string;
  },
  results: string[] = []
): Promise<string[]> {
  if (results.length >= options.maxResults) return results;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= options.maxResults) break;

      // Check ignore
      if (options.ignorePatterns.includes(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const fullPath = join(dir, entry.name);
      const relativePath = relative(options.baseDir, fullPath);

      if (entry.isDirectory()) {
        if (options.includeDirectories && pattern.test(relativePath)) {
          results.push(relativePath);
        }
        await findFilesFallback(fullPath, pattern, options, results);
      } else if (entry.isFile()) {
        if (pattern.test(relativePath)) {
          results.push(relativePath);
        }
      }
    }
  } catch {
    // Ignore permission errors
  }

  return results;
}

// Execute glob search
export async function execute(input: GlobInput): Promise<{
  pattern: string;
  matches: string[];
  count: number;
  truncated: boolean;
}> {
  const {
    pattern,
    cwd = process.cwd(),
    maxResults,
    includeDirectories,
    ignore = [],
  } = inputSchema.parse(input);

  const fg = await loadFastGlob();

  if (fg) {
    // Use fast-glob (preferred)
    try {
      const ignorePatterns = [...DEFAULT_IGNORE, ...ignore];
      const matches = await fg(pattern, {
        cwd,
        ignore: ignorePatterns,
        onlyFiles: !includeDirectories,
        onlyDirectories: false,
        dot: false,
        absolute: false,
        suppressErrors: true,
      });

      const sorted = matches.sort();
      const truncated = sorted.length > maxResults;
      const finalMatches = sorted.slice(0, maxResults);

      return {
        pattern,
        matches: finalMatches,
        count: finalMatches.length,
        truncated,
      };
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback implementation
  const regex = globToRegex(pattern);
  const matches = await findFilesFallback(cwd, regex, {
    maxResults: maxResults + 1,
    includeDirectories,
    ignorePatterns: FALLBACK_IGNORE,
    baseDir: cwd,
  });

  const truncated = matches.length > maxResults;
  const finalMatches = matches.slice(0, maxResults).sort();

  return {
    pattern,
    matches: finalMatches,
    count: finalMatches.length,
    truncated,
  };
}

// Tool definition
export const tool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern. Supports ** for recursive matching, * for wildcards, and ? for single characters.',
  inputSchema,
  permission: 'read',
  execute: async (args) => execute(args as GlobInput),
};
