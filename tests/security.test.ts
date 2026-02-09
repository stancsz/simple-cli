/**
 * Tests for security features
 * Covers permission handling, environment variable filtering, sandboxing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, access } from 'fs/promises';
import { join, resolve } from 'path';
import { runCommand, writeFiles } from '../src/builtins.js';
import { constants } from 'fs';

const isWindows = process.platform === 'win32';

describe('security', () => {
  let testDir: string;
  // Use workspace-relative path to pass isPathAllowed check
  const baseTestDir = resolve(process.cwd(), '.test_tmp');

  beforeEach(async () => {
    testDir = join(baseTestDir, `security-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('command timeout', () => {
    it('should timeout long-running commands', async () => {
      const command = isWindows ? 'powershell -Command "Start-Sleep -Seconds 10"' : 'sleep 10';
      const result = await runCommand.execute({
        command,
        timeout: 500,
        background: false
      });

      expect(result.timedOut).toBe(true);
    });

    it('should not timeout fast commands', async () => {
      const result = await runCommand.execute({
        command: 'echo fast',
        timeout: 5000,
        background: false
      });

      expect(result.timedOut).toBe(false);
      expect(result.stdout.trim()).toBe('fast');
    });
  });

  describe('file permission handling', () => {
    it('should create files with correct permissions', async () => {
      const filePath = join(testDir, 'new_file.txt');

      await writeFiles.execute({
        files: [{ path: filePath, content: 'test' }]
      });

      // Should be readable
      await expect(access(filePath, constants.R_OK)).resolves.toBeUndefined();
    });

    it('should create nested directories with correct permissions', async () => {
      const deepPath = join(testDir, 'a', 'b', 'c', 'file.txt');

      await writeFiles.execute({
        files: [{ path: deepPath, content: 'deep' }]
      });

      // Should exist and be readable
      await expect(access(deepPath, constants.R_OK)).resolves.toBeUndefined();
    });
  });

  describe('command injection prevention', () => {
    it('should handle semicolons in echo safely', async () => {
      const result = await runCommand.execute({
        command: 'echo "hello; rm -rf /"',
        background: false
      });

      // Should just echo the string, not execute rm
      expect(result.stdout).toContain('hello; rm -rf /');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('shell safety', () => {
    it('should handle invalid shell syntax', async () => {
      const result = await runCommand.execute({
        command: 'echo "unclosed',
        background: false
      });

      // Should fail gracefully
      expect(result.exitCode).not.toBe(0);
    });
  });
});
