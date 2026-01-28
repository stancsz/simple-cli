/**
 * File Watcher - Watch files for changes and AI comments
 * Uses chokidar for robust cross-platform watching
 */

import * as chokidar from 'chokidar';
import { readFile } from 'fs/promises';
import { relative, join } from 'path';
import { EventEmitter } from 'events';

// AI comment pattern (matches: # ai!, // ai?, -- ai, etc.)
const AI_COMMENT_PATTERN = /(?:#|\/\/|--|;+)\s*(ai\b.*|ai\b.*|.*\bai[?!]?)\s*$/i;

// Default ignore patterns
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /dist\//,
  /build\//,
  /\.next/,
  /\.nuxt/,
  /__pycache__/,
  /\.pytest_cache/,
  /\.venv/,
  /venv/,
  /\.env$/,
  /\.DS_Store/,
  /\.swp$/,
  /\.swo$/,
  /~$/,
  /\.tmp$/,
  /\.log$/,
];

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

export interface WatcherOptions {
  root: string;
  ignorePatterns?: RegExp[];
  onFileChange?: (filePath: string, type: 'add' | 'change' | 'unlink') => void;
  onAIComment?: (filePath: string, comments: AIComment[]) => void;
  verbose?: boolean;
}

export interface AIComment {
  line: number;
  text: string;
  action: 'request' | 'question' | 'note';
}

interface WatchedFile {
  path: string;
  aiComments: AIComment[];
}

export class FileWatcher extends EventEmitter {
  private watcher: chokidar.FSWatcher | null = null;
  private watchedFiles: Map<string, WatchedFile> = new Map();
  private ignorePatterns: RegExp[];
  private verbose: boolean;

  constructor(private options: WatcherOptions) {
    super();
    this.ignorePatterns = [...IGNORE_PATTERNS, ...(options.ignorePatterns || [])];
    this.verbose = options.verbose || false;

    if (options.onFileChange) this.on('file-change', options.onFileChange);
    if (options.onAIComment) this.on('ai-comment', options.onAIComment);
  }

  start(): void {
    if (this.watcher) return;

    this.log(`Starting chokidar watcher on ${this.options.root}`);

    this.watcher = chokidar.watch(this.options.root, {
      ignored: (path) => this.shouldIgnore(path),
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100
      }
    });

    this.watcher
      .on('add', (path) => this.handleChange(path, 'add'))
      .on('change', (path) => this.handleChange(path, 'change'))
      .on('unlink', (path) => this.handleUnlink(path));
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      this.log('Watcher stopped');
    }
    this.watchedFiles.clear();
  }

  private shouldIgnore(path: string): boolean {
    const relPath = relative(this.options.root, path);
    // Always include root
    if (path === this.options.root) return false;

    return this.ignorePatterns.some(pattern => pattern.test(relPath));
  }

  private async handleChange(path: string, type: 'add' | 'change'): Promise<void> {
    const relPath = relative(this.options.root, path);

    // Skip large files (chokidar might have already stat-ed, but we want to be safe before reading)
    // Note: chokidar doesn't expose stat size in event easily without another stat call or 'add' stats arg
    // For simplicity, we just read.

    try {
      // ... Check size logic could go here if critical

      const comments = await this.extractAIComments(path);
      const existing = this.watchedFiles.get(path);

      const hasNewComments = comments.length > 0 && (
        !existing || JSON.stringify(comments) !== JSON.stringify(existing.aiComments)
      );

      this.watchedFiles.set(path, { path, aiComments: comments });

      this.emit('file-change', relPath, type);
      if (hasNewComments) {
        this.emit('ai-comment', relPath, comments);
      }
    } catch (e) {
      this.log(`Error processing ${relPath}: ${e}`);
    }
  }

  private handleUnlink(path: string): void {
    const relPath = relative(this.options.root, path);
    this.watchedFiles.delete(path);
    this.emit('file-change', relPath, 'unlink');
  }

  private async extractAIComments(filePath: string): Promise<AIComment[]> {
    try {
      const content = await readFile(filePath, 'utf-8');
      if (content.length > MAX_FILE_SIZE) return [];

      const lines = content.split('\n');
      const comments: AIComment[] = [];

      for (let i = 0; i < lines.length; i++) {
        const match = AI_COMMENT_PATTERN.exec(lines[i]);
        if (match) {
          const text = match[1].trim();
          let action: AIComment['action'] = 'note';
          const lower = text.toLowerCase();

          if (lower.endsWith('!') || lower.startsWith('ai!')) action = 'request';
          else if (lower.endsWith('?') || lower.startsWith('ai?')) action = 'question';

          comments.push({ line: i + 1, text, action });
        }
      }
      return comments;
    } catch {
      return [];
    }
  }

  getActionableCommentsPrompt(): string {
    const parts: string[] = [];
    for (const [path, file] of this.watchedFiles) {
      const actionable = file.aiComments.filter(c => c.action === 'request' || c.action === 'question');
      if (actionable.length > 0) {
        const relPath = relative(this.options.root, path);
        parts.push(`\n${relPath}:`);
        for (const c of actionable) {
          parts.push(`  Line ${c.line} [${c.action === 'request' ? '!' : '?'}]: ${c.text}`);
        }
      }
    }
    return parts.length > 0 ? `The following AI comments were found in the codebase:${parts.join('\n')}` : '';
  }

  private log(msg: string) {
    if (this.verbose) console.log(`[Watcher] ${msg}`);
  }
}

export function createFileWatcher(options: WatcherOptions): FileWatcher {
  const w = new FileWatcher(options);
  w.start();
  return w;
}
