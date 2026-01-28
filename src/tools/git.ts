/**
 * Git Tool - Git operations for version control
 * Based on Aider's repo.py
 */

import { z } from 'zod';
import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Tool } from '../registry.js';

// Input schema for git operations
export const inputSchema = z.object({
  operation: z.enum([
    'status',
    'diff',
    'log',
    'add',
    'commit',
    'branch',
    'checkout',
    'stash',
    'show',
    'blame',
  ]).describe('Git operation to perform'),
  args: z.array(z.string()).optional().describe('Additional arguments for the operation'),
  cwd: z.string().optional().describe('Working directory'),
  message: z.string().optional().describe('Commit message (for commit operation)'),
  files: z.array(z.string()).optional().describe('Files to operate on'),
});

type GitInput = z.infer<typeof inputSchema>;

interface GitResult {
  operation: string;
  success: boolean;
  output: string;
  error?: string;
}

// Check if directory is a git repository
function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

// Run git command
function runGit(args: string[], cwd: string): GitResult {
  const operation = args[0] || 'unknown';

  try {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB
      timeout: 60000,
    });

    if (result.error) {
      return {
        operation,
        success: false,
        output: '',
        error: result.error.message,
      };
    }

    const output = (result.stdout || '') + (result.stderr || '');
    const success = result.status === 0;

    return {
      operation,
      success,
      output: output.trim(),
      error: success ? undefined : output.trim(),
    };
  } catch (error) {
    return {
      operation,
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// Execute git operation
export async function execute(input: GitInput): Promise<GitResult> {
  const {
    operation,
    args = [],
    cwd = process.cwd(),
    message,
    files = [],
  } = inputSchema.parse(input);

  // Check if it's a git repository
  if (!isGitRepo(cwd)) {
    return {
      operation,
      success: false,
      output: '',
      error: 'Not a git repository',
    };
  }

  // Build git command based on operation
  let gitArgs: string[] = [];

  switch (operation) {
    case 'status':
      gitArgs = ['status', '--porcelain=v1', ...args];
      break;

    case 'diff':
      gitArgs = ['diff', '--no-color', ...args, ...files];
      break;

    case 'log':
      gitArgs = [
        'log',
        '--oneline',
        '--no-decorate',
        '-n', '20',
        ...args,
      ];
      break;

    case 'add':
      if (files.length === 0) {
        return {
          operation,
          success: false,
          output: '',
          error: 'No files specified to add',
        };
      }
      gitArgs = ['add', ...args, ...files];
      break;

    case 'commit':
      if (!message) {
        return {
          operation,
          success: false,
          output: '',
          error: 'Commit message required',
        };
      }
      gitArgs = ['commit', '-m', message, ...args];
      break;

    case 'branch':
      gitArgs = ['branch', '--no-color', ...args];
      break;

    case 'checkout':
      gitArgs = ['checkout', ...args, ...files];
      break;

    case 'stash':
      gitArgs = ['stash', ...args];
      break;

    case 'show':
      gitArgs = ['show', '--no-color', '--stat', ...args];
      break;

    case 'blame':
      if (files.length === 0) {
        return {
          operation,
          success: false,
          output: '',
          error: 'File path required for blame',
        };
      }
      gitArgs = ['blame', '--no-color', '-l', ...args, files[0]];
      break;

    default:
      return {
        operation,
        success: false,
        output: '',
        error: `Unknown operation: ${operation}`,
      };
  }

  return runGit(gitArgs, cwd);
}

// Get current branch
export function getCurrentBranch(cwd: string = process.cwd()): string | null {
  try {
    const result = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
    });
    return result.trim();
  } catch {
    return null;
  }
}

// Get list of changed files
export function getChangedFiles(cwd: string = process.cwd()): string[] {
  try {
    const result = execSync('git status --porcelain=v1', {
      cwd,
      encoding: 'utf-8',
    });
    return result
      .split('\n')
      .filter(Boolean)
      .map(line => line.slice(3).trim());
  } catch {
    return [];
  }
}

// Get list of tracked files
export function getTrackedFiles(cwd: string = process.cwd()): string[] {
  try {
    const result = execSync('git ls-files', {
      cwd,
      encoding: 'utf-8',
    });
    return result.split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

// Check if file is ignored
export function isIgnored(filePath: string, cwd: string = process.cwd()): boolean {
  try {
    execSync(`git check-ignore -q "${filePath}"`, {
      cwd,
      encoding: 'utf-8',
    });
    return true;
  } catch {
    return false;
  }
}

// Get commit message for staged changes (using AI)
export function getStagedDiff(cwd: string = process.cwd()): string | null {
  try {
    const result = execSync('git diff --cached', {
      cwd,
      encoding: 'utf-8',
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

// Tool definition
export const tool: Tool = {
  name: 'git',
  description: 'Perform git operations: status, diff, log, add, commit, branch, checkout, stash, show, blame',
  inputSchema,
  permission: 'execute',
  execute: async (args) => execute(args as GitInput),
};
