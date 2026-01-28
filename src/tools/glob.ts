/**
 * Glob Tool - Find files matching patterns
 * Based on GeminiCLI's glob.ts
 */

import { z } from 'zod';
import { readdir, stat } from 'fs/promises';
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
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  '.idea',
  '.vscode',
  '*.pyc',
  '*.pyo',
  '.DS_Store',
  'Thumbs.db',
];

// Convert glob pattern to regex
function globToRegex(pattern: string): RegExp {
  let regex = pattern
    // Escape special regex characters except * and ?
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // ** matches any path (including /)
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
    // * matches anything except /
    .replace(/\*/g, '[^/]*')
    // ? matches single character except /
    .replace(/\?/g, '[^/]')
    // Restore **
    .replace(/<<<DOUBLESTAR>>>/g, '.*');

  // Handle patterns starting with **/ to match from root
  if (pattern.startsWith('**/')) {
    regex = '(?:^|/)' + regex.slice(4);
  }

  return new RegExp(`${regex}$`, 'i');
}

// Check if path matches any ignore pattern
function shouldIgnore(path: string, ignorePatterns: string[]): boolean {
  const name = basename(path);
  
  for (const pattern of ignorePatterns) {
    if (pattern.includes('*')) {
      const regex = globToRegex(pattern);
      if (regex.test(path) || regex.test(name)) {
        return true;
      }
    } else {
      if (path.includes(pattern) || name === pattern) {
        return true;
      }
    }
  }
  
  return false;
}

// Recursively find files matching pattern
async function findFiles(
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
  if (results.length >= options.maxResults) {
    return results;
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= options.maxResults) {
        break;
      }

      const fullPath = join(dir, entry.name);
      const relativePath = relative(options.baseDir, fullPath);

      // Check ignore patterns
      if (shouldIgnore(relativePath, options.ignorePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Check if directory matches pattern
        if (options.includeDirectories && pattern.test(relativePath)) {
          results.push(relativePath);
        }

        // Recurse into directory
        await findFiles(fullPath, pattern, options, results);
      } else if (entry.isFile()) {
        // Check if file matches pattern
        if (pattern.test(relativePath)) {
          results.push(relativePath);
        }
      }
    }
  } catch (error) {
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

  const ignorePatterns = [...DEFAULT_IGNORE, ...ignore];
  const regex = globToRegex(pattern);

  const matches = await findFiles(cwd, regex, {
    maxResults: maxResults + 1, // Get one extra to detect truncation
    includeDirectories,
    ignorePatterns,
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
