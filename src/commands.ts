/**
 * Slash Commands System
 * Based on Aider's commands.py
 */

import { readFile, writeFile, stat, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, resolve, dirname, basename } from 'path';
import { getMCPManager } from './mcp/manager.js';
import { getCurrentBranch, getChangedFiles, getStagedDiff } from './tools/git.js';
import { execute as grepExecute } from './tools/grep.js';
import { execute as globExecute } from './tools/glob.js';

export interface CommandContext {
  cwd: string;
  activeFiles: Set<string>;
  readOnlyFiles: Set<string>;
  history: Array<{ role: string; content: string }>;
  io: {
    output: (message: string) => void;
    error: (message: string) => void;
    confirm: (message: string) => Promise<boolean>;
    prompt: (message: string) => Promise<string>;
  };
}

export interface Command {
  name: string;
  aliases: string[];
  description: string;
  execute: (args: string, context: CommandContext) => Promise<string | void>;
}

// Parse command line into command and args
export function parseCommand(input: string): { command: string; args: string } | null {
  if (!input.startsWith('/')) {
    return null;
  }

  const trimmed = input.slice(1).trim();
  const spaceIndex = trimmed.indexOf(' ');

  if (spaceIndex === -1) {
    return { command: trimmed.toLowerCase(), args: '' };
  }

  return {
    command: trimmed.slice(0, spaceIndex).toLowerCase(),
    args: trimmed.slice(spaceIndex + 1).trim(),
  };
}

// Built-in commands
export const commands: Command[] = [
  // File Management
  {
    name: 'add',
    aliases: ['a'],
    description: 'Add files to the chat context',
    execute: async (args, ctx) => {
      if (!args) {
        ctx.io.output('Usage: /add <file_pattern>');
        return;
      }

      const patterns = args.split(/\s+/);
      let added = 0;

      for (const pattern of patterns) {
        // Check if it's a glob pattern
        if (pattern.includes('*')) {
          const result = await globExecute({ pattern, cwd: ctx.cwd, ignore: [], maxResults: 1000, includeDirectories: false });
          for (const file of result.matches) {
            const fullPath = resolve(ctx.cwd, file);
            if (!ctx.activeFiles.has(fullPath)) {
              ctx.activeFiles.add(fullPath);
              ctx.io.output(`Added ${file}`);
              added++;
            }
          }
        } else {
          const fullPath = resolve(ctx.cwd, pattern);
          if (existsSync(fullPath)) {
            if (!ctx.activeFiles.has(fullPath)) {
              ctx.activeFiles.add(fullPath);
              ctx.io.output(`Added ${pattern}`);
              added++;
            }
          } else {
            // File doesn't exist - offer to create it
            const create = await ctx.io.confirm(`File ${pattern} doesn't exist. Create it?`);
            if (create) {
              await writeFile(fullPath, '');
              ctx.activeFiles.add(fullPath);
              ctx.io.output(`Created and added ${pattern}`);
              added++;
            }
          }
        }
      }

      ctx.io.output(`Added ${added} file(s) to the chat`);
    },
  },

  {
    name: 'drop',
    aliases: ['d', 'remove'],
    description: 'Remove files from the chat context',
    execute: async (args, ctx) => {
      if (!args) {
        // Drop all files
        const count = ctx.activeFiles.size;
        ctx.activeFiles.clear();
        ctx.io.output(`Dropped all ${count} file(s)`);
        return;
      }

      const patterns = args.split(/\s+/);
      let dropped = 0;

      for (const pattern of patterns) {
        const fullPath = resolve(ctx.cwd, pattern);
        if (ctx.activeFiles.has(fullPath)) {
          ctx.activeFiles.delete(fullPath);
          ctx.io.output(`Dropped ${pattern}`);
          dropped++;
        }
      }

      ctx.io.output(`Dropped ${dropped} file(s)`);
    },
  },

  {
    name: 'ls',
    aliases: ['files', 'list'],
    description: 'List files in the chat context',
    execute: async (args, ctx) => {
      if (ctx.activeFiles.size === 0 && ctx.readOnlyFiles.size === 0) {
        ctx.io.output('No files in chat context');
        return;
      }

      if (ctx.activeFiles.size > 0) {
        ctx.io.output('\nEditable files:');
        for (const file of ctx.activeFiles) {
          ctx.io.output(`  ${relative(ctx.cwd, file)}`);
        }
      }

      if (ctx.readOnlyFiles.size > 0) {
        ctx.io.output('\nRead-only files:');
        for (const file of ctx.readOnlyFiles) {
          ctx.io.output(`  ${relative(ctx.cwd, file)}`);
        }
      }
    },
  },

  {
    name: 'read-only',
    aliases: ['ro'],
    description: 'Add files as read-only context',
    execute: async (args, ctx) => {
      if (!args) {
        // Convert all active files to read-only
        for (const file of ctx.activeFiles) {
          ctx.readOnlyFiles.add(file);
        }
        ctx.activeFiles.clear();
        ctx.io.output('Converted all files to read-only');
        return;
      }

      const patterns = args.split(/\s+/);
      for (const pattern of patterns) {
        if (pattern.includes('*')) {
          const result = await globExecute({ pattern, cwd: ctx.cwd, maxResults: 1000, includeDirectories: false });
          for (const file of result.matches) {
            const fullPath = resolve(ctx.cwd, file);
            ctx.readOnlyFiles.add(fullPath);
            ctx.io.output(`Added ${file} as read-only`);
          }
        } else {
          const fullPath = resolve(ctx.cwd, pattern);
          if (existsSync(fullPath)) {
            ctx.readOnlyFiles.add(fullPath);
            ctx.io.output(`Added ${pattern} as read-only`);
          }
        }
      }
    },
  },

  // Git Integration
  {
    name: 'git',
    aliases: [],
    description: 'Run a git command',
    execute: async (args, ctx) => {
      const { spawnSync } = await import('child_process');
      const result = spawnSync('git', args.split(/\s+/), {
        cwd: ctx.cwd,
        encoding: 'utf-8',
      });

      if (result.stdout) ctx.io.output(result.stdout);
      if (result.stderr) ctx.io.error(result.stderr);
    },
  },

  {
    name: 'diff',
    aliases: [],
    description: 'Show git diff of changes',
    execute: async (args, ctx) => {
      const { spawnSync } = await import('child_process');
      const gitArgs = args ? args.split(/\s+/) : [];
      const result = spawnSync('git', ['diff', '--no-color', ...gitArgs], {
        cwd: ctx.cwd,
        encoding: 'utf-8',
      });

      if (result.stdout) {
        ctx.io.output(result.stdout);
      } else {
        ctx.io.output('No changes');
      }
    },
  },

  {
    name: 'commit',
    aliases: [],
    description: 'Commit staged changes with AI-generated message',
    execute: async (args, ctx) => {
      const diff = getStagedDiff(ctx.cwd);
      if (!diff) {
        ctx.io.output('No staged changes to commit');
        return;
      }

      const message = args || 'Update files';
      const { spawnSync } = await import('child_process');
      const result = spawnSync('git', ['commit', '-m', message], {
        cwd: ctx.cwd,
        encoding: 'utf-8',
      });

      if (result.stdout) ctx.io.output(result.stdout);
      if (result.stderr) ctx.io.error(result.stderr);
    },
  },

  // Search
  {
    name: 'search',
    aliases: ['grep', 'find'],
    description: 'Search for pattern in files',
    execute: async (args, ctx) => {
      if (!args) {
        ctx.io.output('Usage: /search <pattern> [path]');
        return;
      }

      const parts = args.split(/\s+/);
      const pattern = parts[0];
      const path = parts[1] || ctx.cwd;

      const result = await grepExecute({
        pattern,
        path,
        maxResults: 50,
        ignoreCase: true,
        contextLines: 2,
        filesOnly: false,
        includeHidden: false,
      });

      if (result.matches.length === 0) {
        ctx.io.output('No matches found');
        return;
      }

      ctx.io.output(`Found ${result.count} matches in ${result.files.length} file(s):`);
      for (const match of result.matches.slice(0, 20)) {
        ctx.io.output(`  ${match.file}:${match.line}: ${match.text.trim()}`);
      }

      if (result.truncated) {
        ctx.io.output(`  ... and more (truncated)`);
      }
    },
  },

  // Chat Management
  {
    name: 'clear',
    aliases: ['reset'],
    description: 'Clear chat history',
    execute: async (args, ctx) => {
      ctx.history.length = 0;
      ctx.io.output('Chat history cleared');
    },
  },

  {
    name: 'undo',
    aliases: [],
    description: 'Undo the last git commit made by the AI',
    execute: async (args, ctx) => {
      const { spawnSync } = await import('child_process');
      const result = spawnSync('git', ['reset', '--soft', 'HEAD~1'], {
        cwd: ctx.cwd,
        encoding: 'utf-8',
      });

      if (result.status === 0) {
        ctx.io.output('Undid last commit');
      } else {
        ctx.io.error('Failed to undo commit');
      }
    },
  },

  // Context
  {
    name: 'tokens',
    aliases: [],
    description: 'Show approximate token count',
    execute: async (args, ctx) => {
      let totalChars = 0;

      for (const file of ctx.activeFiles) {
        try {
          const content = await readFile(file, 'utf-8');
          totalChars += content.length;
        } catch { }
      }

      for (const file of ctx.readOnlyFiles) {
        try {
          const content = await readFile(file, 'utf-8');
          totalChars += content.length;
        } catch { }
      }

      for (const msg of ctx.history) {
        totalChars += msg.content.length;
      }

      // Rough estimate: ~4 chars per token
      const estimatedTokens = Math.ceil(totalChars / 4);
      ctx.io.output(`Approximate tokens: ${estimatedTokens.toLocaleString()}`);
      ctx.io.output(`  Files: ${ctx.activeFiles.size} editable, ${ctx.readOnlyFiles.size} read-only`);
      ctx.io.output(`  History: ${ctx.history.length} messages`);
    },
  },

  // MCP
  {
    name: 'mcp',
    aliases: [],
    description: 'MCP server management',
    execute: async (args, ctx) => {
      const manager = getMCPManager();
      const parts = args.split(/\s+/);
      const subcommand = parts[0] || 'status';

      switch (subcommand) {
        case 'status': {
          const statuses = manager.getAllServerStatuses();
          if (statuses.size === 0) {
            ctx.io.output('No MCP servers configured');
            return;
          }
          ctx.io.output('MCP Servers:');
          for (const [name, status] of statuses) {
            ctx.io.output(`  ${name}: ${status}`);
          }
          break;
        }

        case 'tools': {
          const tools = manager.getAllTools();
          if (tools.length === 0) {
            ctx.io.output('No MCP tools available');
            return;
          }
          ctx.io.output(`MCP Tools (${tools.length}):`);
          for (const tool of tools) {
            ctx.io.output(`  ${tool.name} (${tool.serverName}): ${tool.description}`);
          }
          break;
        }

        case 'connect': {
          await manager.connectAll();
          ctx.io.output('Connected to MCP servers');
          break;
        }

        case 'disconnect': {
          await manager.disconnectAll();
          ctx.io.output('Disconnected from MCP servers');
          break;
        }

        default:
          ctx.io.output('Usage: /mcp [status|tools|connect|disconnect]');
      }
    },
  },

  // Web
  {
    name: 'web',
    aliases: ['url', 'fetch'],
    description: 'Fetch a URL and add to context',
    execute: async (args, ctx) => {
      if (!args) {
        ctx.io.output('Usage: /web <url>');
        return;
      }

      const { execute: scrapeExecute } = await import('./tools/scraper.js');
      const result = await scrapeExecute({ url: args, convertToMarkdown: true, verifySSL: true, timeout: 10000 });

      if (result.error) {
        ctx.io.error(`Failed to fetch: ${result.error}`);
        return;
      }

      ctx.io.output(`Fetched ${args} (${result.content.length} chars)`);

      // Add to history as context
      ctx.history.push({
        role: 'user',
        content: `Content from ${args}:\n\n${result.content}`,
      });
    },
  },

  // Help
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show available commands',
    execute: async (args, ctx) => {
      ctx.io.output('\nAvailable commands:\n');

      for (const cmd of commands) {
        const aliases = cmd.aliases.length > 0 ? ` (${cmd.aliases.join(', ')})` : '';
        ctx.io.output(`  /${cmd.name}${aliases}`);
        ctx.io.output(`    ${cmd.description}\n`);
      }
    },
  },

  // Exit
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit the CLI',
    execute: async (args, ctx) => {
      ctx.io.output('Goodbye!');
      process.exit(0);
    },
  },
];

// Find command by name or alias
export function findCommand(name: string): Command | undefined {
  const lower = name.toLowerCase();
  return commands.find(
    cmd => cmd.name === lower || cmd.aliases.includes(lower)
  );
}

// Execute a command
export async function executeCommand(
  input: string,
  context: CommandContext
): Promise<string | void> {
  const parsed = parseCommand(input);

  if (!parsed) {
    return undefined; // Not a command
  }

  const command = findCommand(parsed.command);

  if (!command) {
    context.io.error(`Unknown command: /${parsed.command}. Type /help for available commands.`);
    return;
  }

  return command.execute(parsed.args, context);
}
