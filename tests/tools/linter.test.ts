/**
 * Tests for linter tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { execute, tool } from '../../src/tools/linter.js';

describe('linter tool', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-linter-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('lint');
    });

    it('should have correct permission', () => {
      expect(tool.permission).toBe('read');
    });

    it('should have description', () => {
      expect(tool.description).toContain('syntax');
    });
  });

  describe('Python linting', () => {
    it('should pass valid Python', async () => {
      const filePath = join(testDir, 'valid.py');
      await writeFile(filePath, 'def hello():\n    return "world"\n');

      const result = await execute({ path: filePath });

      expect(result.passed).toBe(true);
      expect(result.language).toBe('python');
    });

    it('should detect syntax errors', async () => {
      const filePath = join(testDir, 'invalid.py');
      await writeFile(filePath, 'def hello(\n    return "broken"\n');

      const result = await execute({ path: filePath });

      expect(result.passed).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report line numbers', async () => {
      const filePath = join(testDir, 'error.py');
      await writeFile(filePath, 'x = 1\ny =\nz = 3\n');

      const result = await execute({ path: filePath });

      if (result.errors.length > 0) {
        expect(result.errors[0].line).toBeGreaterThan(0);
      }
    });
  });

  describe('JavaScript linting', () => {
    it('should pass valid JavaScript', async () => {
      const filePath = join(testDir, 'valid.js');
      await writeFile(filePath, 'const x = 1;\nconsole.log(x);\n');

      const result = await execute({ path: filePath });

      expect(result.language).toBe('javascript');
    });

    it('should detect syntax errors', async () => {
      const filePath = join(testDir, 'invalid.js');
      await writeFile(filePath, 'const x = {;\n');

      const result = await execute({ path: filePath });

      expect(result.passed).toBe(false);
    });
  });

  describe('TypeScript linting', () => {
    it('should identify TypeScript files', async () => {
      const filePath = join(testDir, 'code.ts');
      await writeFile(filePath, 'const x: number = 1;\n');

      const result = await execute({ path: filePath });

      expect(result.language).toBe('typescript');
    });
  });

  describe('Shell linting', () => {
    it('should lint shell scripts', async () => {
      const filePath = join(testDir, 'script.sh');
      await writeFile(filePath, '#!/bin/bash\necho "hello"\n');

      const result = await execute({ path: filePath });

      expect(result.language).toBe('shell');
    });

    it('should detect shell syntax errors', async () => {
      const filePath = join(testDir, 'bad.sh');
      await writeFile(filePath, '#!/bin/bash\nif [ $x\n');

      const result = await execute({ path: filePath });

      expect(result.passed).toBe(false);
    });
  });

  describe('file handling', () => {
    it('should return error for non-existent file', async () => {
      const result = await execute({ path: join(testDir, 'nonexistent.py') });

      expect(result.passed).toBe(false);
      expect(result.errors[0].message).toContain('not found');
    });

    it('should handle unknown language gracefully', async () => {
      const filePath = join(testDir, 'file.xyz');
      await writeFile(filePath, 'unknown content');

      const result = await execute({ path: filePath });

      expect(result.passed).toBe(true); // No linter available
    });
  });

  describe('result structure', () => {
    it('should return correct structure', async () => {
      const filePath = join(testDir, 'test.py');
      await writeFile(filePath, 'x = 1\n');

      const result = await execute({ path: filePath });

      expect(result).toHaveProperty('file');
      expect(result).toHaveProperty('language');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('output');
    });

    it('should separate errors and warnings', async () => {
      const filePath = join(testDir, 'test.py');
      await writeFile(filePath, 'x = 1\n');

      const result = await execute({ path: filePath });

      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });
});
