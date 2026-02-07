/**
 * Context Manager - Manages conversation context and file state
 * Based on Aider's coder.py and GeminiCLI's context management
 * Uses gpt-tokenizer for accurate token counting (with fallback)
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { relative, resolve } from 'path';
import { generateRepoMap } from './repoMap.js';
import { getActiveSkill, type Skill } from './skills.js';
import { loadAllTools, getToolDefinitions, type Tool } from './registry.js';
import { getPromptProvider } from './prompts/provider.js';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: number;
}

export interface ContextState {
  cwd: string;
  activeFiles: Set<string>;
  readOnlyFiles: Set<string>;
  history: Message[];
  skill: Skill;
  tokenEstimate: number;
}

// Cached tokenizer (typed as any to handle missing module)
let tokenEncoder: ((text: string) => number[]) | null = null;
let tokenizerLoaded = false;

/**
 * Load tokenizer lazily (handles case where gpt-tokenizer not installed)
 */
async function loadTokenizer(): Promise<void> {
  if (tokenizerLoaded) return;
  tokenizerLoaded = true;

  try {
    const mod = await import('gpt-tokenizer') as any;
    tokenEncoder = mod.encode;
  } catch {
    // gpt-tokenizer not installed, will use fallback
  }
}

/**
 * Count tokens using gpt-tokenizer (accurate for GPT models)
 * Falls back to rough estimation if not available
 */
async function countTokensAsync(text: string): Promise<number> {
  await loadTokenizer();

  if (tokenEncoder) {
    try {
      return tokenEncoder(text).length;
    } catch {
      // Fall through to estimation
    }
  }

  // Fallback: ~4 chars per token (rough but reasonable)
  return Math.ceil(text.length / 4);
}

/**
 * Synchronous token count (uses cached encoder or estimation)
 */
function countTokens(text: string): number {
  if (tokenEncoder) {
    try {
      return tokenEncoder(text).length;
    } catch {
      // Fall through
    }
  }
  return Math.ceil(text.length / 4);
}

/**
 * ContextManager class
 * Manages the conversation context, file state, and system prompts
 */
export class ContextManager {
  private cwd: string;
  private activeFiles: Set<string> = new Set();
  private readOnlyFiles: Set<string> = new Set();
  private history: Message[] = [];
  private skill: Skill;
  private tools: Map<string, Tool> = new Map();
  private repoMapCache: string = '';
  private repoMapTimestamp: number = 0;

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd();
    this.skill = getActiveSkill();
  }

  /**
   * Extract keywords from recent conversation history
   */
  extractKeywords(history: Message[]): string[] {
    if (history.length === 0) return [];

    // Look at last 3 messages
    const recentMessages = history.slice(-3);
    const text = recentMessages.map(m => m.content).join(' ').toLowerCase();

    // Basic stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
      'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from', 'about',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
      'this', 'that', 'these', 'those', 'here', 'there', 'what', 'where', 'when', 'who', 'how', 'why',
      'can', 'could', 'will', 'would', 'should', 'do', 'does', 'did', 'done', 'have', 'has', 'had',
      'be', 'been', 'being', 'not', 'no', 'yes', 'please', 'thanks', 'thank', 'hello', 'hi',
      'tool', 'use', 'using', 'run', 'running', 'execute', 'executing', 'call', 'calling',
      'file', 'files', 'folder', 'directory', 'code', 'function', 'class', 'method'
    ]);

    // Extract words (simple regex)
    const words = text.match(/[a-z0-9_-]+/g) || [];

    const uniqueKeywords = new Set<string>();
    for (const word of words) {
      if (word.length > 2 && !stopWords.has(word)) {
        uniqueKeywords.add(word);
      }
    }

    return Array.from(uniqueKeywords);
  }

  /**
   * Initialize the context manager
   */
  async initialize(): Promise<void> {
    // Load tools
    this.tools = await loadAllTools();

    // Generate initial repo map
    await this.refreshRepoMap();
  }

  /**
   * Add a file to active context
   */
  addFile(path: string, readOnly: boolean = false): boolean {
    const fullPath = resolve(this.cwd, path);

    if (!existsSync(fullPath)) {
      return false;
    }

    if (readOnly) {
      this.readOnlyFiles.add(fullPath);
      this.activeFiles.delete(fullPath);
    } else {
      this.activeFiles.add(fullPath);
      this.readOnlyFiles.delete(fullPath);
    }

    return true;
  }

  /**
   * Remove a file from context
   */
  removeFile(path: string): boolean {
    const fullPath = resolve(this.cwd, path);
    const wasActive = this.activeFiles.delete(fullPath);
    const wasReadOnly = this.readOnlyFiles.delete(fullPath);
    return wasActive || wasReadOnly;
  }

  /**
   * Add a message to history
   */
  addMessage(role: Message['role'], content: string): void {
    this.history.push({
      role,
      content,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Get all files in context
   */
  getFiles(): { active: string[]; readOnly: string[] } {
    return {
      active: Array.from(this.activeFiles).map(f => relative(this.cwd, f)),
      readOnly: Array.from(this.readOnlyFiles).map(f => relative(this.cwd, f)),
    };
  }

  /**
   * Read all files in context
   */
  async getFileContents(): Promise<Map<string, string>> {
    const contents = new Map<string, string>();

    for (const file of [...this.activeFiles, ...this.readOnlyFiles]) {
      try {
        const content = await readFile(file, 'utf-8');
        const relPath = relative(this.cwd, file);
        contents.set(relPath, content);
      } catch {
        // Skip files that can't be read
      }
    }

    return contents;
  }

  /**
   * Set the active skill
   */
  setSkill(skill: Skill): void {
    this.skill = skill;
  }

  /**
   * Get the current skill
   */
  getSkill(): Skill {
    return this.skill;
  }

  /**
   * Refresh the repository map
   */
  async refreshRepoMap(): Promise<string> {
    const now = Date.now();

    // Cache for 30 seconds
    if (this.repoMapCache && now - this.repoMapTimestamp < 30000) {
      return this.repoMapCache;
    }

    // Adaptive: extract keywords from history
    const keywords = this.extractKeywords(this.history);

    this.repoMapCache = await generateRepoMap(this.cwd, keywords);
    this.repoMapTimestamp = now;

    return this.repoMapCache;
  }

  /**
   * Build the system prompt
   */
  async buildSystemPrompt(): Promise<string> {
    const provider = getPromptProvider();
    const systemPrompt = await provider.getSystemPrompt({
      cwd: this.cwd,
      skillPrompt: this.skill.systemPrompt
    });

    const parts: string[] = [systemPrompt];

    // Tool definitions
    const toolDefs = getToolDefinitions(this.tools);
    parts.push('\n## Available Tools\n' + toolDefs);

    // Active files
    const files = this.getFiles();
    if (files.active.length > 0 || files.readOnly.length > 0) {
      parts.push('\n## Context Files');

      if (files.active.length > 0) {
        parts.push('\nEditable files:');
        parts.push(files.active.map(f => `- ${f}`).join('\n'));
      }

      if (files.readOnly.length > 0) {
        parts.push('\nRead-only files:');
        parts.push(files.readOnly.map(f => `- ${f}`).join('\n'));
      }
    }


    // Repository map (condensed)
    const repoMap = await this.refreshRepoMap();
    if (repoMap) {
      const condensed = repoMap.split('\n').slice(0, 50).join('\n');
      parts.push('\n## Repository Structure\n' + condensed);
      if (repoMap.split('\n').length > 50) {
        parts.push('... (truncated)');
      }
    }

    return parts.join('\n');
  }

  /**
   * Build messages for LLM
   */
  async buildMessages(userMessage: string, maxTokens: number = 30000): Promise<Message[]> {
    const messages: Message[] = [];

    // System prompt
    const systemPrompt = await this.buildSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });

    // File contents as context
    const fileContents = await this.getFileContents();
    if (fileContents.size > 0) {
      let fileContext = '## File Contents\n\n';
      for (const [path, content] of fileContents) {
        const truncated = content.length > 10000
          ? content.slice(0, 10000) + '\n... (truncated)'
          : content;
        fileContext += `### ${path}\n\`\`\`\n${truncated}\n\`\`\`\n\n`;
      }
      messages.push({ role: 'user', content: fileContext });
      messages.push({ role: 'assistant', content: 'I have read the files. How can I help?' });
    }

    // Calculate current token usage
    let currentTokens = 0;
    for (const msg of messages) {
      currentTokens += countTokens(msg.content) + 4;
    }

    const finalUserMessage = { role: 'user' as const, content: userMessage };
    currentTokens += countTokens(finalUserMessage.content) + 4;

    const availableTokens = maxTokens - currentTokens;

    // Add history reversed, counting tokens
    const historyMessages: Message[] = [];
    let historyTokens = 0;

    // Always try to keep the last 2 messages for continuity if possible
    const reversedHistory = [...this.history].reverse();

    for (const msg of reversedHistory) {
        const msgTokens = countTokens(msg.content) + 4;
        if (historyTokens + msgTokens > availableTokens) {
            break;
        }
        historyTokens += msgTokens;
        historyMessages.unshift(msg);
    }

    return [...messages, ...historyMessages, finalUserMessage];
  }

  /**
   * Estimate token count using accurate tokenizer
   */
  async estimateTokenCount(): Promise<number> {
    // Ensure tokenizer is loaded
    await loadTokenizer();

    let total = 0;

    // System prompt
    const systemPrompt = await this.buildSystemPrompt();
    total += countTokens(systemPrompt);

    // File contents
    const fileContents = await this.getFileContents();
    for (const content of fileContents.values()) {
      total += countTokens(content);
    }

    // History
    for (const msg of this.history) {
      total += countTokens(msg.content);
    }

    // Add overhead for message formatting (~4 tokens per message)
    total += (this.history.length + 2) * 4;

    return total;
  }

  /**
   * Get current state
   */
  getState(): ContextState {
    return {
      cwd: this.cwd,
      activeFiles: this.activeFiles,
      readOnlyFiles: this.readOnlyFiles,
      history: this.history,
      skill: this.skill,
      tokenEstimate: 0, // Calculated async
    };
  }

  /**
   * Restore state
   */
  restoreState(state: Partial<ContextState>): void {
    if (state.cwd) this.cwd = state.cwd;
    if (state.activeFiles) this.activeFiles = state.activeFiles;
    if (state.readOnlyFiles) this.readOnlyFiles = state.readOnlyFiles;
    if (state.history) this.history = state.history;
    if (state.skill) this.skill = state.skill;
  }

  /**
   * Get conversation history
   */
  getHistory(): Message[] {
    return [...this.history];
  }

  /**
   * Get tools
   */
  getTools(): Map<string, Tool> {
    return this.tools;
  }

  /**
   * Get working directory
   */
  getCwd(): string {
    return this.cwd;
  }
}

// Create a global context manager instance
let globalContext: ContextManager | null = null;

export function getContextManager(cwd?: string): ContextManager {
  if (!globalContext) {
    globalContext = new ContextManager(cwd);
  }
  return globalContext;
}

// Export token counting utility for use elsewhere
export { countTokens };
