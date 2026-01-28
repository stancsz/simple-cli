/**
 * Tests for runCommand tool
 * Equivalent to Aider's test_run_cmd.py and GeminiCLI's run_shell_command.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execute, schema } from '../../src/tools/runCommand.js';

describe('runCommand', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('basic execution', () => {
    it('should run echo command successfully', async () => {
      const result = await execute({ command: 'echo "Hello, World!"' });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello, World!');
      expect(result.timedOut).toBe(false);
    });

    it('should capture stdout', async () => {
      const result = await execute({ command: 'echo test-output' });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('test-output');
    });

    it('should capture stderr', async () => {
      const result = await execute({ command: 'echo error-message >&2' });

      expect(result.stderr).toContain('error-message');
    });

    it('should return non-zero exit code for failed commands', async () => {
      const result = await execute({ command: 'exit 1' });

      expect(result.exitCode).toBe(1);
    });

    it('should handle command not found', async () => {
      const result = await execute({ command: 'nonexistent_command_xyz' });

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('working directory', () => {
    it('should execute command in specified directory', async () => {
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'test content');

      const result = await execute({
        command: 'ls',
        cwd: testDir
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test.txt');
    });

    it('should handle invalid working directory', async () => {
      const result = await execute({
        command: 'echo test',
        cwd: '/nonexistent/path/xyz'
      });

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('timeout handling', () => {
    it('should timeout long-running commands', async () => {
      const result = await execute({
        command: 'sleep 10',
        timeout: 500
      });

      expect(result.timedOut).toBe(true);
    });

    it('should complete before timeout', async () => {
      const result = await execute({
        command: 'echo fast',
        timeout: 5000
      });

      expect(result.timedOut).toBe(false);
      expect(result.stdout).toBe('fast');
    });
  });

  describe('environment variables', () => {
    it('should pass custom environment variables', async () => {
      const result = await execute({
        command: 'echo $TEST_VAR',
        env: { TEST_VAR: 'custom_value' }
      });

      expect(result.stdout).toContain('custom_value');
    });

    it('should filter sensitive environment variables', async () => {
      // The tool should not pass through API keys
      const result = await execute({
        command: 'env',
        env: {
          API_KEY: 'secret123',
          SECRET_TOKEN: 'token456',
          NORMAL_VAR: 'allowed'
        }
      });

      // NORMAL_VAR should be present, but not the secrets
      expect(result.stdout).toContain('NORMAL_VAR=allowed');
      expect(result.stdout).not.toContain('secret123');
      expect(result.stdout).not.toContain('token456');
    });
  });

  describe('output truncation', () => {
    it('should truncate very large stdout', async () => {
      // Generate output larger than 100KB limit
      const result = await execute({
        command: 'yes "test" | head -n 50000',
        timeout: 10000
      });

      // Should complete and potentially be truncated
      expect(result.stdout.length).toBeLessThanOrEqual(100100); // 100KB + buffer
    });
  });

  describe('shell features', () => {
    it('should support piping', async () => {
      const result = await execute({
        command: 'echo "hello world" | grep hello'
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello');
    });

    it('should support command chaining with &&', async () => {
      const result = await execute({
        command: 'echo first && echo second'
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('first');
      expect(result.stdout).toContain('second');
    });

    it('should stop on error with &&', async () => {
      const result = await execute({
        command: 'exit 1 && echo should_not_appear'
      });

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).not.toContain('should_not_appear');
    });

    it('should handle invalid shell syntax', async () => {
      const result = await execute({
        command: 'echo "hello" > > file'
      });

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('schema validation', () => {
    it('should validate input schema', () => {
      // Valid input
      expect(() => schema.parse({ command: 'echo test' })).not.toThrow();

      // Invalid input - missing command
      expect(() => schema.parse({})).toThrow();

      // Invalid input - command not a string
      expect(() => schema.parse({ command: 123 })).toThrow();

      // Valid with optional fields
      expect(() => schema.parse({
        command: 'echo test',
        cwd: '/tmp',
        timeout: 5000,
        env: { VAR: 'value' }
      })).not.toThrow();
    });
  });

  describe('file operations via shell', () => {
    it('should be able to count lines in a file', async () => {
      const testFile = join(testDir, 'lines.txt');
      await writeFile(testFile, 'line1\nline2\nline3\n');

      const result = await execute({
        command: `wc -l < "${testFile}"`
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('3');
    });

    it('should list files in directory', async () => {
      const file1 = join(testDir, 'file1.txt');
      const file2 = join(testDir, 'file2.txt');
      await writeFile(file1, '');
      await writeFile(file2, '');

      const result = await execute({
        command: 'ls',
        cwd: testDir
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('file1.txt');
      expect(result.stdout).toContain('file2.txt');
    });
  });
});
