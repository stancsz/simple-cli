import { describe, it, expect, vi } from 'vitest';
import { validateCommand } from '../src/security/validation.js';
import { ContextManager } from '../src/context.js';
import path from 'path';

describe('Security Validation', () => {
  const mockCwd = '/app';
  const mockContext = {
    getCwd: () => mockCwd,
  } as unknown as ContextManager;

  describe('Shell Command Validation', () => {
    it('blocks rm -rf /', async () => {
      const result = await validateCommand('run_command', { command: 'rm -rf /' }, mockContext);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Command blocked');
    });

    it('blocks rm -rf *', async () => {
      const result = await validateCommand('run_command', { command: 'rm -rf *' }, mockContext);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Command blocked');
    });

    it('blocks rm -rf ~', async () => {
      const result = await validateCommand('run_command', { command: 'rm -rf ~' }, mockContext);
      expect(result.valid).toBe(false);
    });

    it('allows safe commands', async () => {
      const result = await validateCommand('run_command', { command: 'ls -la' }, mockContext);
      expect(result.valid).toBe(true);
    });

    it('blocks fork bomb', async () => {
        const result = await validateCommand('run_command', { command: ':(){ :|:& };:' }, mockContext);
        expect(result.valid).toBe(false);
    });
  });

  describe('File Confinement Validation', () => {
    it('allows file in cwd', async () => {
      const result = await validateCommand('write_to_file', { path: 'test.txt' }, mockContext);
      expect(result.valid).toBe(true);
    });

    it('blocks file outside cwd (../)', async () => {
      const result = await validateCommand('write_to_file', { path: '../secret.txt' }, mockContext);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Access denied');
    });

    it('blocks absolute path outside cwd', async () => {
      const result = await validateCommand('write_to_file', { path: '/etc/passwd' }, mockContext);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Access denied');
    });

    it('allows absolute path inside cwd', async () => {
        const result = await validateCommand('write_to_file', { path: '/app/test.txt' }, mockContext);
        expect(result.valid).toBe(true);
    });

    it('blocks access to sensitive files like .env', async () => {
      const result = await validateCommand('read_files', { paths: ['.env'] }, mockContext);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Sensitive file access');
    });

    it('blocks access to .git', async () => {
      const result = await validateCommand('delete_file', { path: '.git/config' }, mockContext);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Access denied');
    });

    it('validates write_files array', async () => {
        const result = await validateCommand('write_files', {
            files: [
                { path: 'safe.txt' },
                { path: '../unsafe.txt' }
            ]
        }, mockContext);
        expect(result.valid).toBe(false);
    });

    it('validates move_file source and destination', async () => {
        const result = await validateCommand('move_file', { source: 'safe.txt', destination: '../unsafe.txt' }, mockContext);
        expect(result.valid).toBe(false);
    });
  });
});
