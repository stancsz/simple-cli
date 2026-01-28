/**
 * Tests for git tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { execSync } from 'child_process';
import { join } from 'path';
import { tmpdir } from 'os';

import { execute, tool, getCurrentBranch, getChangedFiles, getTrackedFiles } from '../../src/tools/git.js';

describe('git tool', () => {
  let testDir: string;
  let isGitRepo = false;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-git-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    // Initialize git repo
    try {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
      isGitRepo = true;
    } catch {
      isGitRepo = false;
    }
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('git');
    });

    it('should have correct permission', () => {
      expect(tool.permission).toBe('execute');
    });
  });

  describe('git status', () => {
    it('should return status of repo', async () => {
      if (!isGitRepo) return;

      await writeFile(join(testDir, 'file.txt'), 'content');

      const result = await execute({
        operation: 'status',
        cwd: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('file.txt');
    });

    it('should show clean repo', async () => {
      if (!isGitRepo) return;

      const result = await execute({
        operation: 'status',
        cwd: testDir,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('git add', () => {
    it('should add files to staging', async () => {
      if (!isGitRepo) return;

      await writeFile(join(testDir, 'file.txt'), 'content');

      const result = await execute({
        operation: 'add',
        files: ['file.txt'],
        cwd: testDir,
      });

      expect(result.success).toBe(true);

      // Verify file is staged
      const status = await execute({ operation: 'status', cwd: testDir });
      expect(status.output).toContain('A');
    });

    it('should fail without files', async () => {
      if (!isGitRepo) return;

      const result = await execute({
        operation: 'add',
        cwd: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('No files');
    });
  });

  describe('git commit', () => {
    it('should commit staged changes', async () => {
      if (!isGitRepo) return;

      await writeFile(join(testDir, 'file.txt'), 'content');
      execSync('git add file.txt', { cwd: testDir, stdio: 'pipe' });

      const result = await execute({
        operation: 'commit',
        message: 'Test commit',
        cwd: testDir,
      });

      expect(result.success).toBe(true);
    });

    it('should fail without message', async () => {
      if (!isGitRepo) return;

      const result = await execute({
        operation: 'commit',
        cwd: testDir,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('message');
    });
  });

  describe('git diff', () => {
    it('should show diff of changes', async () => {
      if (!isGitRepo) return;

      await writeFile(join(testDir, 'file.txt'), 'content');
      execSync('git add file.txt && git commit -m "initial"', { cwd: testDir, stdio: 'pipe' });
      await writeFile(join(testDir, 'file.txt'), 'modified content');

      const result = await execute({
        operation: 'diff',
        cwd: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('modified');
    });

    it('should show no diff for clean repo', async () => {
      if (!isGitRepo) return;

      const result = await execute({
        operation: 'diff',
        cwd: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });
  });

  describe('git log', () => {
    it('should show commit history', async () => {
      if (!isGitRepo) return;

      await writeFile(join(testDir, 'file.txt'), 'content');
      execSync('git add file.txt && git commit -m "test commit"', { cwd: testDir, stdio: 'pipe' });

      const result = await execute({
        operation: 'log',
        cwd: testDir,
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('test commit');
    });
  });

  describe('git branch', () => {
    it('should list branches', async () => {
      if (!isGitRepo) return;

      await writeFile(join(testDir, 'file.txt'), 'content');
      execSync('git add file.txt && git commit -m "initial"', { cwd: testDir, stdio: 'pipe' });

      const result = await execute({
        operation: 'branch',
        cwd: testDir,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('helper functions', () => {
    it('getCurrentBranch should return branch name', () => {
      if (!isGitRepo) return;

      const branch = getCurrentBranch(testDir);
      expect(branch).toBeTruthy();
    });

    it('getChangedFiles should return modified files', async () => {
      if (!isGitRepo) return;

      await writeFile(join(testDir, 'file.txt'), 'content');

      const files = getChangedFiles(testDir);
      expect(files).toContain('file.txt');
    });

    it('getTrackedFiles should return tracked files', async () => {
      if (!isGitRepo) return;

      await writeFile(join(testDir, 'file.txt'), 'content');
      execSync('git add file.txt && git commit -m "add"', { cwd: testDir, stdio: 'pipe' });

      const files = getTrackedFiles(testDir);
      expect(files).toContain('file.txt');
    });
  });

  describe('non-git directory', () => {
    it('should fail for non-git directory', async () => {
      const nonGitDir = join(tmpdir(), `non-git-${Date.now()}`);
      await mkdir(nonGitDir, { recursive: true });

      try {
        const result = await execute({
          operation: 'status',
          cwd: nonGitDir,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not a git repository');
      } finally {
        await rm(nonGitDir, { recursive: true, force: true });
      }
    });
  });
});
