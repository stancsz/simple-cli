/**
 * Git Operations using simple-git
 * Reliable git operations leveraging the native Git binary
 */

import simpleGit, {
  SimpleGit,
  StatusResult,
  DiffResult,
  LogResult,
  BranchSummary,
} from 'simple-git';
import { join } from 'path';

export interface GitConfig {
  cwd?: string;
  timeout?: number;
}

export interface CommitOptions {
  message: string;
  files?: string[];
  amend?: boolean;
  noVerify?: boolean;
  author?: string;
}

export interface DiffOptions {
  staged?: boolean;
  file?: string;
  from?: string;
  to?: string;
}

/**
 * GitManager - Wrapper around simple-git for reliable git operations
 */
export class GitManager {
  private git: SimpleGit;
  private cwd: string;

  constructor(config: GitConfig = {}) {
    this.cwd = config.cwd || process.cwd();
    this.git = simpleGit({
      baseDir: this.cwd,
      binary: 'git',
      maxConcurrentProcesses: 6,
      timeout: {
        block: config.timeout || 30000,
      },
    });
  }

  /**
   * Check if current directory is a git repository
   */
  async isRepo(): Promise<boolean> {
    try {
      await this.git.revparse(['--git-dir']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize a new git repository
   */
  async init(): Promise<void> {
    await this.git.init();
  }

  /**
   * Get repository status
   */
  async status(): Promise<StatusResult> {
    return this.git.status();
  }

  /**
   * Get current branch name
   */
  async currentBranch(): Promise<string | null> {
    try {
      const result = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      return result.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Get all branches
   */
  async branches(): Promise<BranchSummary> {
    return this.git.branch();
  }

  /**
   * Checkout a branch
   */
  async checkout(branch: string, create: boolean = false): Promise<void> {
    if (create) {
      await this.git.checkoutLocalBranch(branch);
    } else {
      await this.git.checkout(branch);
    }
  }

  /**
   * Stage files
   */
  async add(files: string | string[]): Promise<void> {
    const fileList = Array.isArray(files) ? files : [files];
    await this.git.add(fileList);
  }

  /**
   * Stage all changes
   */
  async addAll(): Promise<void> {
    await this.git.add('-A');
  }

  /**
   * Commit changes
   */
  async commit(options: CommitOptions): Promise<{ hash: string; message: string } | null> {
    const { message, files, amend, noVerify, author } = options;

    try {
      const commitOptions: Record<string, string | null> = {};

      if (amend) {
        commitOptions['--amend'] = null;
      }

      if (noVerify) {
        commitOptions['--no-verify'] = null;
      }

      if (author) {
        commitOptions['--author'] = author;
      }

      if (files && files.length > 0) {
        await this.git.add(files);
      }

      const result = await this.git.commit(message, files || [], commitOptions);

      if (result.commit) {
        return {
          hash: result.commit,
          message: message,
        };
      }

      return null;
    } catch (error) {
      console.error('Commit failed:', error);
      return null;
    }
  }

  /**
   * Get diff
   */
  async diff(options: DiffOptions = {}): Promise<string> {
    const args: string[] = ['--no-color'];

    if (options.staged) {
      args.push('--cached');
    }

    if (options.from && options.to) {
      args.push(options.from, options.to);
    } else if (options.from) {
      args.push(options.from);
    }

    if (options.file) {
      args.push('--', options.file);
    }

    return this.git.diff(args);
  }

  /**
   * Get staged diff
   */
  async stagedDiff(): Promise<string> {
    return this.diff({ staged: true });
  }

  /**
   * Get commit log
   */
  async log(maxCount: number = 20): Promise<LogResult> {
    return this.git.log({ maxCount });
  }

  /**
   * Get the last commit
   */
  async lastCommit(): Promise<{ hash: string; message: string; author: string; date: string } | null> {
    try {
      const log = await this.git.log({ maxCount: 1 });
      if (log.latest) {
        return {
          hash: log.latest.hash,
          message: log.latest.message,
          author: log.latest.author_name,
          date: log.latest.date,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Undo the last commit (soft reset)
   */
  async undoLastCommit(): Promise<boolean> {
    try {
      await this.git.reset(['--soft', 'HEAD~1']);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Hard reset to a commit
   */
  async hardReset(commit: string = 'HEAD'): Promise<void> {
    await this.git.reset(['--hard', commit]);
  }

  /**
   * Stash changes
   */
  async stash(message?: string): Promise<void> {
    if (message) {
      await this.git.stash(['push', '-m', message]);
    } else {
      await this.git.stash();
    }
  }

  /**
   * Pop stash
   */
  async stashPop(): Promise<void> {
    await this.git.stash(['pop']);
  }

  /**
   * Get list of tracked files
   */
  async trackedFiles(): Promise<string[]> {
    const result = await this.git.raw(['ls-files']);
    return result.split('\n').filter(Boolean);
  }

  /**
   * Get list of changed files (staged + unstaged)
   */
  async changedFiles(): Promise<string[]> {
    const status = await this.status();
    return [
      ...status.modified,
      ...status.created,
      ...status.deleted,
      ...status.renamed.map(r => r.to),
      ...status.not_added,
    ];
  }

  /**
   * Check if a file is ignored
   */
  async isIgnored(file: string): Promise<boolean> {
    try {
      await this.git.raw(['check-ignore', '-q', file]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get blame for a file
   */
  async blame(file: string): Promise<string> {
    return this.git.raw(['blame', '--no-color', '-l', file]);
  }

  /**
   * Show a specific commit
   */
  async show(commit: string): Promise<string> {
    return this.git.show(['--no-color', '--stat', commit]);
  }

  /**
   * Get the root directory of the repository
   */
  async rootDir(): Promise<string | null> {
    try {
      const result = await this.git.revparse(['--show-toplevel']);
      return result.trim();
    } catch {
      return null;
    }
  }

  /**
   * Pull changes from remote
   */
  async pull(remote: string = 'origin', branch?: string): Promise<void> {
    if (branch) {
      await this.git.pull(remote, branch);
    } else {
      await this.git.pull();
    }
  }

  /**
   * Push changes to remote
   */
  async push(remote: string = 'origin', branch?: string, options?: { setUpstream?: boolean }): Promise<void> {
    const args: string[] = [];

    if (options?.setUpstream) {
      args.push('-u');
    }

    args.push(remote);

    if (branch) {
      args.push(branch);
    }

    await this.git.push(args);
  }

  /**
   * Create a new branch from current HEAD
   */
  async createBranch(name: string): Promise<void> {
    await this.git.checkoutLocalBranch(name);
  }

  /**
   * Delete a branch
   */
  async deleteBranch(name: string, force: boolean = false): Promise<void> {
    await this.git.deleteLocalBranch(name, force);
  }

  /**
   * Merge a branch into current branch
   */
  async merge(branch: string): Promise<void> {
    await this.git.merge([branch]);
  }

  /**
   * Get the raw simple-git instance for advanced operations
   */
  raw(): SimpleGit {
    return this.git;
  }
}

// Singleton instance
let gitManager: GitManager | null = null;

/**
 * Get or create a GitManager instance
 */
export function getGitManager(config?: GitConfig): GitManager {
  if (!gitManager || config) {
    gitManager = new GitManager(config);
  }
  return gitManager;
}

/**
 * Generate AI commit message from diff
 */
export async function generateCommitMessage(
  diff: string,
  generateFn: (prompt: string) => Promise<string>,
  context?: string
): Promise<string> {
  const prompt = `Generate a concise git commit message for these changes.

Guidelines:
- Start with a type: feat, fix, refactor, docs, test, chore
- Keep the first line under 72 characters
- Focus on the "why" not the "what"
- Use imperative mood ("add" not "added")

${context ? `Context: ${context}\n` : ''}
Diff:
\`\`\`
${diff.slice(0, 4000)}${diff.length > 4000 ? '\n... (truncated)' : ''}
\`\`\`

Respond with ONLY the commit message, no explanation.`;

  const message = await generateFn(prompt);

  // Clean up the response
  return message
    .trim()
    .replace(/^["']|["']$/g, '') // Remove quotes
    .replace(/^commit:?\s*/i, '') // Remove "commit:" prefix
    .split('\n')[0]; // Take only first line
}
