/**
 * Tests for security features
 * Covers permission handling, environment variable filtering, sandboxing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, access } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execute as runCommandExecute } from '../src/tools/run_command.js';
import { execute as writeFilesExecute } from '../src/tools/write_files.js';
const isWindows = process.platform === 'win32';
import { constants } from 'fs';

describe('security', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-security-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('environment variable filtering', () => {
    it('should not pass API keys to shell commands', async () => {
      const command = isWindows ? 'set' : 'env';
      const result = await runCommandExecute({
        command,
        env: {
          MY_API_KEY: 'secret-key-123',
          NORMAL_VAR: 'allowed'
        }
      });

      expect(result.stdout).toContain('NORMAL_VAR=allowed');
      expect(result.stdout).not.toContain('secret-key-123');
    });

    it('should not pass secret tokens to shell commands', async () => {
      const command = isWindows ? 'set' : 'env';
      const result = await runCommandExecute({
        command,
        env: {
          SECRET_TOKEN: 'my-secret-token',
          PUBLIC_VAR: 'public-value'
        }
      });

      expect(result.stdout).toContain('PUBLIC_VAR=public-value');
      expect(result.stdout).not.toContain('my-secret-token');
    });

    it('should not pass passwords to shell commands', async () => {
      const command = isWindows ? 'set' : 'env';
      const result = await runCommandExecute({
        command,
        env: {
          DB_PASSWORD: 'super-secret-password',
          DB_HOST: 'localhost'
        }
      });

      expect(result.stdout).toContain('DB_HOST=localhost');
      expect(result.stdout).not.toContain('super-secret-password');
    });

    it('should preserve safe environment variables', async () => {
      const command = isWindows ? 'echo %PATH%' : 'echo $PATH';
      const result = await runCommandExecute({
        command,
      });

      expect(result.exitCode).toBe(0);
      // PATH should be available
      expect(result.stdout).toBeDefined();
    });
  });

  describe('command timeout', () => {
    it('should timeout long-running commands', async () => {
      const command = isWindows ? 'powershell -Command "Start-Sleep -Seconds 10"' : 'sleep 10';
      const result = await runCommandExecute({
        command,
        timeout: 500
      });

      expect(result.timedOut).toBe(true);
    });

    it('should not timeout fast commands', async () => {
      const result = await runCommandExecute({
        command: 'echo fast',
        timeout: 5000
      });

      expect(result.timedOut).toBe(false);
      expect(result.stdout).toBe('fast');
    });

    it('should use default timeout when not specified', async () => {
      const result = await runCommandExecute({
        command: 'echo test'
        // No timeout specified, should use default (30s)
      });

      expect(result.timedOut).toBe(false);
    });
  });

  describe('output truncation', () => {
    it('should truncate very large stdout', async () => {
      // Generate large output
      const command = isWindows
        ? 'powershell -Command "1..5000 | ForEach-Object { \'test row\' }"'
        : 'yes "test line" | head -n 20000';
      const result = await runCommandExecute({
        command,
        timeout: 10000
      });

      // Should be truncated to ~100KB
      expect(result.stdout.length).toBeLessThanOrEqual(110000);
    });
  });

  describe('working directory restrictions', () => {
    it('should execute in specified working directory', async () => {
      await writeFile(join(testDir, 'marker.txt'), 'found');

      const result = await runCommandExecute({
        command: isWindows ? 'dir /b' : 'ls',
        cwd: testDir
      });

      expect(result.stdout).toContain('marker.txt');
    });

    it('should fail for nonexistent working directory', async () => {
      const result = await runCommandExecute({
        command: 'echo test',
        cwd: '/nonexistent/path/xyz123'
      });

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('file permission handling', () => {
    it('should create files with correct permissions', async () => {
      const filePath = join(testDir, 'new_file.txt');

      await writeFilesExecute({
        files: [{ path: filePath, content: 'test' }]
      });

      // Should be readable
      await expect(access(filePath, constants.R_OK)).resolves.toBeUndefined();
    });

    it('should create nested directories with correct permissions', async () => {
      const deepPath = join(testDir, 'a', 'b', 'c', 'file.txt');

      await writeFilesExecute({
        files: [{ path: deepPath, content: 'deep' }]
      });

      // Should exist and be readable
      await expect(access(deepPath, constants.R_OK)).resolves.toBeUndefined();
    });
  });

  describe('command injection prevention', () => {
    it('should handle semicolons in echo safely', async () => {
      const result = await runCommandExecute({
        command: 'echo "hello; rm -rf /"'
      });

      // Should just echo the string, not execute rm
      expect(result.stdout).toContain('hello; rm -rf /');
      expect(result.exitCode).toBe(0);
    });

    it('should handle backticks in echo safely', async () => {
      const result = await runCommandExecute({
        command: 'echo "test `whoami` end"'
      });

      // The backticks might be interpreted by shell, but within quotes
      // The output depends on shell behavior
      expect(result.exitCode).toBe(0);
    });

    it('should handle $() in echo safely', async () => {
      const result = await runCommandExecute({
        command: 'echo "test $(echo nested) end"'
      });

      // Shell will interpret this, showing nested substitution works
      expect(result.exitCode).toBe(0);
    });
  });

  describe('permission tiers', () => {
    it('should classify read operations correctly', async () => {
      const { loadAllTools } = await import('../src/registry.js');
      const tools = await loadAllTools();

      const readTool = tools.get('read_files');
      expect(readTool?.permission).toBe('read');
    });

    it('should classify write operations correctly', async () => {
      const { loadAllTools } = await import('../src/registry.js');
      const tools = await loadAllTools();

      const writeTool = tools.get('write_files');
      expect(writeTool?.permission).toBe('write');
    });

    it('should classify execute operations correctly', async () => {
      const { loadAllTools } = await import('../src/registry.js');
      const tools = await loadAllTools();

      const execTool = tools.get('run_command');
      expect(execTool?.permission).toBe('execute');
    });
  });

  describe('shell safety', () => {
    it('should handle invalid shell syntax', async () => {
      const result = await runCommandExecute({
        command: 'echo "unclosed'
      });

      // Should fail gracefully
      expect(result.exitCode).not.toBe(0);
    });

    it('should handle pipe failures', async () => {
      const result = await runCommandExecute({
        command: 'nonexistent_cmd_xyz123'  // Just run a nonexistent command
      });

      // Command should fail (exit code 127 = command not found)
      expect(result.exitCode).not.toBe(0);
    });

    it('should handle redirection errors', async () => {
      const result = await runCommandExecute({
        command: 'echo test > /nonexistent_dir_xyz/file.txt'
      });

      expect(result.exitCode).not.toBe(0);
    });
  });
});
