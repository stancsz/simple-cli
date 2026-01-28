/**
 * Tests for slash commands system
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  parseCommand,
  findCommand,
  executeCommand,
  commands,
  type CommandContext,
} from '../src/commands.js';

describe('commands', () => {
  let testDir: string;
  let context: CommandContext;
  let output: string[];
  let errors: string[];

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-commands-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    output = [];
    errors = [];

    context = {
      cwd: testDir,
      activeFiles: new Set(),
      readOnlyFiles: new Set(),
      history: [],
      io: {
        output: (msg) => output.push(msg),
        error: (msg) => errors.push(msg),
        confirm: async () => true,
        prompt: async () => '',
      },
    };
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('parseCommand', () => {
    it('should parse command without args', () => {
      const result = parseCommand('/help');
      expect(result).toEqual({ command: 'help', args: '' });
    });

    it('should parse command with args', () => {
      const result = parseCommand('/add file.txt other.txt');
      expect(result).toEqual({ command: 'add', args: 'file.txt other.txt' });
    });

    it('should return null for non-commands', () => {
      expect(parseCommand('not a command')).toBeNull();
      expect(parseCommand('  /not-starting-with-slash')).toBeNull();
    });

    it('should handle extra whitespace', () => {
      const result = parseCommand('/search   pattern   ');
      expect(result?.command).toBe('search');
      expect(result?.args).toBe('pattern');
    });

    it('should lowercase command name', () => {
      const result = parseCommand('/HELP');
      expect(result?.command).toBe('help');
    });
  });

  describe('findCommand', () => {
    it('should find command by name', () => {
      const cmd = findCommand('help');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('help');
    });

    it('should find command by alias', () => {
      const cmd = findCommand('h');
      expect(cmd).toBeDefined();
      expect(cmd?.name).toBe('help');
    });

    it('should return undefined for unknown command', () => {
      const cmd = findCommand('nonexistent');
      expect(cmd).toBeUndefined();
    });

    it('should be case insensitive', () => {
      const cmd = findCommand('HELP');
      expect(cmd?.name).toBe('help');
    });
  });

  describe('/add command', () => {
    it('should add existing file', async () => {
      await writeFile(join(testDir, 'test.txt'), 'content');

      await executeCommand('/add test.txt', context);

      expect(context.activeFiles.size).toBe(1);
      expect(output.some(o => o.includes('Added'))).toBe(true);
    });

    it('should add multiple files', async () => {
      await writeFile(join(testDir, 'a.txt'), '');
      await writeFile(join(testDir, 'b.txt'), '');

      await executeCommand('/add a.txt b.txt', context);

      expect(context.activeFiles.size).toBe(2);
    });

    it('should handle glob patterns', async () => {
      await writeFile(join(testDir, 'file1.ts'), '');
      await writeFile(join(testDir, 'file2.ts'), '');
      await writeFile(join(testDir, 'file3.js'), '');

      await executeCommand('/add *.ts', context);

      expect(context.activeFiles.size).toBe(2);
    });

    it('should show usage without args', async () => {
      await executeCommand('/add', context);

      expect(output.some(o => o.includes('Usage'))).toBe(true);
    });
  });

  describe('/drop command', () => {
    it('should drop specific file', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, '');
      context.activeFiles.add(filePath);

      await executeCommand('/drop test.txt', context);

      expect(context.activeFiles.size).toBe(0);
    });

    it('should drop all files without args', async () => {
      context.activeFiles.add(join(testDir, 'a.txt'));
      context.activeFiles.add(join(testDir, 'b.txt'));

      await executeCommand('/drop', context);

      expect(context.activeFiles.size).toBe(0);
    });
  });

  describe('/ls command', () => {
    it('should list active files', async () => {
      context.activeFiles.add(join(testDir, 'active.txt'));
      context.readOnlyFiles.add(join(testDir, 'readonly.txt'));

      await executeCommand('/ls', context);

      expect(output.some(o => o.includes('active.txt'))).toBe(true);
      expect(output.some(o => o.includes('readonly.txt'))).toBe(true);
    });

    it('should show message when no files', async () => {
      await executeCommand('/ls', context);

      expect(output.some(o => o.includes('No files'))).toBe(true);
    });
  });

  describe('/read-only command', () => {
    it('should add file as read-only', async () => {
      await writeFile(join(testDir, 'doc.txt'), '');

      await executeCommand('/read-only doc.txt', context);

      expect(context.readOnlyFiles.size).toBe(1);
    });

    it('should convert active files to read-only', async () => {
      context.activeFiles.add(join(testDir, 'file.txt'));

      await executeCommand('/read-only', context);

      expect(context.activeFiles.size).toBe(0);
      expect(context.readOnlyFiles.size).toBe(1);
    });
  });

  describe('/clear command', () => {
    it('should clear history', async () => {
      context.history.push({ role: 'user', content: 'test' });
      context.history.push({ role: 'assistant', content: 'response' });

      await executeCommand('/clear', context);

      expect(context.history.length).toBe(0);
    });
  });

  describe('/tokens command', () => {
    it('should show token estimate', async () => {
      context.history.push({ role: 'user', content: 'Hello world' });

      await executeCommand('/tokens', context);

      expect(output.some(o => o.includes('tokens'))).toBe(true);
    });
  });

  describe('/help command', () => {
    it('should show available commands', async () => {
      await executeCommand('/help', context);

      expect(output.some(o => o.includes('/add'))).toBe(true);
      expect(output.some(o => o.includes('/drop'))).toBe(true);
      expect(output.some(o => o.includes('/help'))).toBe(true);
    });
  });

  describe('unknown command', () => {
    it('should show error for unknown command', async () => {
      await executeCommand('/nonexistent', context);

      expect(errors.some(e => e.includes('Unknown command'))).toBe(true);
    });
  });

  describe('non-command input', () => {
    it('should return undefined for non-commands', async () => {
      const result = await executeCommand('regular message', context);

      expect(result).toBeUndefined();
    });
  });

  describe('command list', () => {
    it('should have all essential commands', () => {
      const commandNames = commands.map(c => c.name);

      expect(commandNames).toContain('add');
      expect(commandNames).toContain('drop');
      expect(commandNames).toContain('ls');
      expect(commandNames).toContain('help');
      expect(commandNames).toContain('clear');
      expect(commandNames).toContain('git');
      expect(commandNames).toContain('diff');
      expect(commandNames).toContain('search');
      expect(commandNames).toContain('mcp');
    });

    it('should have descriptions for all commands', () => {
      for (const cmd of commands) {
        expect(cmd.description).toBeTruthy();
        expect(cmd.description.length).toBeGreaterThan(0);
      }
    });
  });
});
