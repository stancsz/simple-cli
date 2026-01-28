/**
 * Grep Tool - Search for patterns in files
 * Uses ripgrep when available, fast-glob + JS regex as fallback
 */

import { z } from 'zod';
import { readFile, readdir, stat } from 'fs/promises';
import { join, relative, extname } from 'path';
import { spawnSync } from 'child_process';
import type { Tool } from '../registry.js';

// Cached fast-glob instance (typed as any to handle missing module)
let fg: any = null;
let fgLoaded = false;

async function loadFastGlob(): Promise<any> {
  if (!fgLoaded) {
    fgLoaded = true;
    try {
      fg = (await import('fast-glob')).default;
    } catch {
      // fast-glob not installed
    }
  }
  return fg;
}

// Input schema
export const inputSchema = z.object({
  pattern: z.string().describe('Regular expression pattern to search for'),
  path: z.string().optional().describe('File or directory to search in'),
  glob: z.string().optional().describe('File pattern to filter (e.g., "*.ts")'),
  ignoreCase: z.boolean().optional().default(false).describe('Case insensitive search'),
  maxResults: z.number().optional().default(100).describe('Maximum number of matches'),
  contextLines: z.number().optional().default(0).describe('Number of context lines before and after'),
  filesOnly: z.boolean().optional().default(false).describe('Only return file names, not matches'),
  includeHidden: z.boolean().optional().default(false).describe('Include hidden files'),
});

type GrepInput = z.infer<typeof inputSchema>;

interface GrepMatch {
  file: string;
  line: number;
  column: number;
  text: string;
  match: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

// Default ignore patterns
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
];

// Text file glob patterns for searching
const TEXT_FILE_PATTERNS = [
  '**/*.{txt,md,json,yaml,yml,toml,xml,html,htm}',
  '**/*.{css,scss,less,js,jsx,ts,tsx,vue,svelte}',
  '**/*.{py,rb,php,java,c,cpp,h,hpp,cs,go,rs,swift,kt,scala}',
  '**/*.{sh,bash,zsh,fish,sql,graphql,prisma}',
  '**/{Makefile,Dockerfile,Containerfile,.gitignore,.dockerignore,.env}',
  '**/.{editorconfig,eslintrc,prettierrc,babelrc}*',
];

// Search a single file
async function searchFile(
  filePath: string,
  regex: RegExp,
  contextLines: number
): Promise<GrepMatch[]> {
  const matches: GrepMatch[] = [];

  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let match;

      // Reset regex for global searches
      regex.lastIndex = 0;

      while ((match = regex.exec(line)) !== null) {
        const result: GrepMatch = {
          file: filePath,
          line: i + 1,
          column: match.index + 1,
          text: line,
          match: match[0],
        };

        if (contextLines > 0) {
          result.contextBefore = lines.slice(Math.max(0, i - contextLines), i);
          result.contextAfter = lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines));
        }

        matches.push(result);

        // Don't find overlapping matches on same line
        if (!regex.global) break;
      }
    }
  } catch {
    // Ignore files that can't be read
  }

  return matches;
}

// Text file extensions for fallback matching
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.toml', '.xml', '.html', '.htm',
  '.css', '.scss', '.less', '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
  '.py', '.rb', '.php', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
  '.rs', '.swift', '.kt', '.scala', '.sh', '.bash', '.zsh', '.fish',
  '.sql', '.graphql', '.prisma', '',
]);

// Fallback: recursive directory search
async function searchDirectoryFallback(
  dir: string,
  regex: RegExp,
  options: {
    glob?: string;
    contextLines: number;
    maxResults: number;
    includeHidden: boolean;
    baseDir: string;
  },
  results: GrepMatch[] = []
): Promise<GrepMatch[]> {
  if (results.length >= options.maxResults) return results;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= options.maxResults) break;

      const fullPath = join(dir, entry.name);
      const relativePath = relative(options.baseDir, fullPath);

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE.includes(entry.name)) continue;
        if (!options.includeHidden && entry.name.startsWith('.')) continue;
        await searchDirectoryFallback(fullPath, regex, options, results);
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase();
        if (!TEXT_EXTENSIONS.has(ext)) continue;
        if (!options.includeHidden && entry.name.startsWith('.')) continue;

        const fileMatches = await searchFile(fullPath, regex, options.contextLines);
        for (const match of fileMatches) {
          if (results.length >= options.maxResults) break;
          match.file = relativePath;
          results.push(match);
        }
      }
    }
  } catch {
    // Ignore permission errors
  }

  return results;
}

// Search directory using fast-glob for file discovery (with fallback)
async function searchDirectory(
  dir: string,
  regex: RegExp,
  options: {
    glob?: string;
    contextLines: number;
    maxResults: number;
    includeHidden: boolean;
    baseDir: string;
  }
): Promise<GrepMatch[]> {
  const results: GrepMatch[] = [];
  const fastGlob = await loadFastGlob();

  if (fastGlob) {
    try {
      // Build ignore patterns
      const ignorePatterns = DEFAULT_IGNORE.map(d => `**/${d}/**`);

      // Use user's glob pattern or default to text files
      const patterns = options.glob ? [options.glob] : TEXT_FILE_PATTERNS;

      // Find files using fast-glob
      const files = await fastGlob(patterns, {
        cwd: dir,
        ignore: ignorePatterns,
        dot: options.includeHidden,
        absolute: true,
        suppressErrors: true,
      });

      // Search each file
      for (const fullPath of files) {
        if (results.length >= options.maxResults) break;

        const fileMatches = await searchFile(fullPath, regex, options.contextLines);
        for (const match of fileMatches) {
          if (results.length >= options.maxResults) break;
          match.file = relative(options.baseDir, fullPath);
          results.push(match);
        }
      }
      return results;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback to recursive directory search
  return searchDirectoryFallback(dir, regex, options, results);
}

// Try to use ripgrep if available
function tryRipgrep(input: GrepInput): GrepMatch[] | null {
  try {
    // Request one more than maxResults to detect truncation
    const maxResults = input.maxResults || 100;
    const args = [
      '--json',
      '--max-count', String(maxResults + 1),
    ];

    // Ignore common directories by default (matching DEFAULT_IGNORE)
    for (const ignore of DEFAULT_IGNORE) {
      args.push('-g', `!${ignore}`);
      args.push('-g', `!${ignore}/**`);
    }

    if (input.ignoreCase) {
      args.push('-i');
    }

    if (input.glob) {
      args.push('-g', input.glob);
    }

    if (input.contextLines && input.contextLines > 0) {
      args.push('-C', String(input.contextLines));
    }

    args.push(input.pattern);

    if (input.path) {
      args.push(input.path);
    }

    const result = spawnSync('rg', args, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: 30000,
    });

    if (result.error) {
      return null; // ripgrep not available
    }

    const matches: GrepMatch[] = [];
    const lines = result.stdout.split('\n').filter(Boolean);

    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === 'match') {
          // Extract all submatches, not just the first one
          const submatches = json.data.submatches || [];
          for (const submatch of submatches) {
            matches.push({
              file: json.data.path.text,
              line: json.data.line_number,
              column: (submatch.start || 0) + 1,
              text: json.data.lines.text.replace(/\n$/, ''),
              match: submatch.match?.text || '',
            });
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    return matches;
  } catch {
    return null;
  }
}

// Execute grep search
export async function execute(input: GrepInput): Promise<{
  pattern: string;
  matches: GrepMatch[];
  files: string[];
  count: number;
  truncated: boolean;
}> {
  const {
    pattern,
    path = process.cwd(),
    glob,
    ignoreCase,
    maxResults,
    contextLines,
    filesOnly,
    includeHidden,
  } = inputSchema.parse(input);

  // Try ripgrep first (but skip if context lines requested - ripgrep parsing doesn't support it)
  if (!contextLines || contextLines === 0) {
    const rgMatches = tryRipgrep(input);
    if (rgMatches !== null && rgMatches.length > 0) {
      const uniqueFiles = [...new Set(rgMatches.map(m => m.file))];
      return {
        pattern,
        matches: filesOnly ? [] : rgMatches.slice(0, maxResults),
        files: uniqueFiles,
        count: rgMatches.length,
        truncated: rgMatches.length > maxResults,
      };
    }
  }

  // Fall back to JavaScript implementation
  const flags = ignoreCase ? 'gi' : 'g';
  const regex = new RegExp(pattern, flags);

  let matches: GrepMatch[];
  const pathStat = await stat(path).catch(() => null);

  if (pathStat?.isFile()) {
    matches = await searchFile(path, regex, contextLines);
  } else if (pathStat?.isDirectory()) {
    matches = await searchDirectory(path, regex, {
      glob,
      contextLines,
      maxResults: maxResults + 1,
      includeHidden,
      baseDir: path,
    });
  } else {
    matches = [];
  }

  const truncated = matches.length > maxResults;
  const finalMatches = matches.slice(0, maxResults);
  const uniqueFiles = [...new Set(finalMatches.map(m => m.file))];

  return {
    pattern,
    matches: filesOnly ? [] : finalMatches,
    files: uniqueFiles,
    count: finalMatches.length,
    truncated,
  };
}

// Tool definition
export const tool: Tool = {
  name: 'grep',
  description: 'Search for a pattern in files using regular expressions. Uses ripgrep if available for better performance.',
  inputSchema,
  permission: 'read',
  execute: async (args) => execute(args as GrepInput),
};
