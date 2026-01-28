/**
 * Tests for writeFiles tool
 * Equivalent to Aider's editblock tests and GeminiCLI's replace.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execute, schema } from '../../src/tools/writeFiles.js';

describe('writeFiles', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('full file writes', () => {
    it('should create a new file with content', async () => {
      const filePath = join(testDir, 'new_file.txt');
      const content = 'hello world';

      const result = await execute({
        files: [{ path: filePath, content }]
      });

      expect(result).toHaveLength(1);
      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe(content);
    });

    it('should overwrite existing file', async () => {
      const filePath = join(testDir, 'existing.txt');
      await writeFile(filePath, 'old content');

      const result = await execute({
        files: [{ path: filePath, content: 'new content' }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('new content');
    });

    it('should write multiple files', async () => {
      const file1 = join(testDir, 'file1.txt');
      const file2 = join(testDir, 'file2.txt');

      const result = await execute({
        files: [
          { path: file1, content: 'content1' },
          { path: file2, content: 'content2' }
        ]
      });

      expect(result).toHaveLength(2);
      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(true);
      expect(await readFile(file1, 'utf-8')).toBe('content1');
      expect(await readFile(file2, 'utf-8')).toBe('content2');
    });

    it('should create parent directories if they do not exist', async () => {
      const filePath = join(testDir, 'nested', 'deep', 'file.txt');

      const result = await execute({
        files: [{ path: filePath, content: 'nested content' }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('nested content');
    });

    it('should handle file paths with spaces', async () => {
      const filePath = join(testDir, 'file with spaces.txt');

      const result = await execute({
        files: [{ path: filePath, content: 'content' }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('content');
    });
  });

  describe('search/replace operations (Aider-style)', () => {
    it('should replace content using search/replace', async () => {
      const filePath = join(testDir, 'replace.txt');
      await writeFile(filePath, 'foo content');

      const result = await execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'foo', replace: 'bar' }]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('bar content');
    });

    it('should handle multiple search/replace operations', async () => {
      const filePath = join(testDir, 'multi_replace.txt');
      await writeFile(filePath, 'hello world');

      const result = await execute({
        files: [{
          path: filePath,
          searchReplace: [
            { search: 'hello', replace: 'goodbye' },
            { search: 'world', replace: 'universe' }
          ]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('goodbye universe');
    });

    it('should report failure when search pattern not found', async () => {
      const filePath = join(testDir, 'no_match.txt');
      await writeFile(filePath, 'original content');

      const result = await execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'not_present', replace: 'replacement' }]
        }]
      });

      expect(result[0].success).toBe(false);
      expect(result[0].message).toContain('No matching search patterns');
      // File should remain unchanged
      expect(await readFile(filePath, 'utf-8')).toBe('original content');
    });

    it('should replace only first occurrence', async () => {
      const filePath = join(testDir, 'first_only.txt');
      await writeFile(filePath, 'line1\nline2\nline1\nline3');

      const result = await execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'line1', replace: 'new_line' }]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('new_line\nline2\nline1\nline3');
    });

    it('should handle multiline search/replace', async () => {
      const filePath = join(testDir, 'multiline.txt');
      await writeFile(filePath, 'function old() {\n  return 1;\n}');

      const result = await execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: 'function old() {\n  return 1;\n}',
            replace: 'function new() {\n  return 2;\n}'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('function new() {\n  return 2;\n}');
    });

    it('should fail when trying to edit non-existent file', async () => {
      const filePath = join(testDir, 'non_existent.txt');

      const result = await execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'a', replace: 'b' }]
        }]
      });

      expect(result[0].success).toBe(false);
      expect(existsSync(filePath)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty content', async () => {
      const filePath = join(testDir, 'empty.txt');

      const result = await execute({
        files: [{ path: filePath, content: '' }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('');
    });

    it('should fail when no content or searchReplace provided', async () => {
      const filePath = join(testDir, 'no_op.txt');

      const result = await execute({
        files: [{ path: filePath }]
      });

      expect(result[0].success).toBe(false);
    });

    it('should validate input schema', () => {
      // Valid input
      expect(() => schema.parse({
        files: [{ path: 'file.txt', content: 'test' }]
      })).not.toThrow();

      // Invalid input - missing files
      expect(() => schema.parse({})).toThrow();

      // Invalid input - missing path
      expect(() => schema.parse({
        files: [{ content: 'test' }]
      })).toThrow();
    });

    it('should handle special characters in content', async () => {
      const filePath = join(testDir, 'special.txt');
      const content = 'Hello $world$ {test} [array] (parens) `backticks`';

      const result = await execute({
        files: [{ path: filePath, content }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe(content);
    });

    it('should handle unicode content', async () => {
      const filePath = join(testDir, 'unicode.txt');
      const content = '你好世界 🌍 émojis γειά';

      const result = await execute({
        files: [{ path: filePath, content }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe(content);
    });
  });
});
