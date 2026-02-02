/**
 * Comprehensive file operation tests
 * Equivalent to GeminiCLI's file-system.test.ts patterns
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, mkdir, rm, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execute as readFilesExecute } from '../src/tools/read_files.js';
import { execute as writeFilesExecute } from '../src/tools/write_files.js';

describe('fileOperations', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-files-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('read-then-write sequence', () => {
    it('should read file, modify, and write back', async () => {
      const filePath = join(testDir, 'version.txt');
      await writeFile(filePath, '1.0.0');

      // Read
      const readResult = await readFilesExecute({ paths: [filePath] });
      expect(readResult[0].content).toBe('1.0.0');

      // Write new version
      const writeResult = await writeFilesExecute({
        files: [{
          path: filePath,
          searchReplace: [{ search: '1.0.0', replace: '1.0.1' }]
        }]
      });
      expect(writeResult[0].success).toBe(true);

      // Verify
      const finalContent = await readFile(filePath, 'utf-8');
      expect(finalContent).toBe('1.0.1');
    });

    it('should handle version bumping', async () => {
      const filePath = join(testDir, 'package.json');
      await writeFile(filePath, JSON.stringify({ version: '2.0.0' }, null, 2));

      // Read and parse
      const readResult = await readFilesExecute({ paths: [filePath] });
      const content = JSON.parse(readResult[0].content!);
      expect(content.version).toBe('2.0.0');

      // Update version
      const writeResult = await writeFilesExecute({
        files: [{
          path: filePath,
          searchReplace: [{ search: '"version": "2.0.0"', replace: '"version": "2.1.0"' }]
        }]
      });
      expect(writeResult[0].success).toBe(true);

      // Verify
      const finalContent = JSON.parse(await readFile(filePath, 'utf-8'));
      expect(finalContent.version).toBe('2.1.0');
    });
  });

  describe('file paths with spaces', () => {
    it('should correctly handle file paths with spaces', async () => {
      const fileName = 'my test file.txt';
      const filePath = join(testDir, fileName);

      // Write
      const writeResult = await writeFilesExecute({
        files: [{ path: filePath, content: 'hello' }]
      });
      expect(writeResult[0].success).toBe(true);

      // Read back
      const readResult = await readFilesExecute({ paths: [filePath] });
      expect(readResult[0].content).toBe('hello');
    });

    it('should handle directory paths with spaces', async () => {
      const dirPath = join(testDir, 'my directory');
      const filePath = join(dirPath, 'file.txt');

      const writeResult = await writeFilesExecute({
        files: [{ path: filePath, content: 'content' }]
      });

      expect(writeResult[0].success).toBe(true);
      expect(existsSync(filePath)).toBe(true);
    });
  });

  describe('non-existent file handling', () => {
    it('should fail safely when trying to edit non-existent file', async () => {
      const filePath = join(testDir, 'non_existent.txt');

      const result = await writeFilesExecute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'a', replace: 'b' }]
        }]
      });

      expect(result[0].success).toBe(false);
      expect(existsSync(filePath)).toBe(false);
    });

    it('should return error when reading non-existent file', async () => {
      const filePath = join(testDir, 'does_not_exist.txt');

      const result = await readFilesExecute({ paths: [filePath] });

      expect(result[0].error).toBeDefined();
      expect(result[0].content).toBeUndefined();
    });
  });

  describe('multiple file operations', () => {
    it('should read multiple files in one call', async () => {
      const file1 = join(testDir, 'file1.txt');
      const file2 = join(testDir, 'file2.txt');
      const file3 = join(testDir, 'file3.txt');

      await writeFile(file1, 'content1');
      await writeFile(file2, 'content2');
      await writeFile(file3, 'content3');

      const result = await readFilesExecute({
        paths: [file1, file2, file3]
      });

      expect(result).toHaveLength(3);
      expect(result[0].content).toBe('content1');
      expect(result[1].content).toBe('content2');
      expect(result[2].content).toBe('content3');
    });

    it('should write multiple files in one call', async () => {
      const file1 = join(testDir, 'new1.txt');
      const file2 = join(testDir, 'new2.txt');

      const result = await writeFilesExecute({
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

    it('should handle mixed success and failure', async () => {
      const existingFile = join(testDir, 'existing.txt');
      const nonExistingFile = join(testDir, 'non_existing.txt');

      await writeFile(existingFile, 'original');

      const result = await writeFilesExecute({
        files: [
          { path: existingFile, searchReplace: [{ search: 'original', replace: 'modified' }] },
          { path: nonExistingFile, searchReplace: [{ search: 'a', replace: 'b' }] }
        ]
      });

      expect(result[0].success).toBe(true);
      expect(result[1].success).toBe(false);
    });
  });

  describe('file encoding', () => {
    it('should handle UTF-8 encoding', async () => {
      const filePath = join(testDir, 'utf8.txt');
      const content = 'Hello 世界 🌍 émojis';

      await writeFile(filePath, content, 'utf-8');

      const result = await readFilesExecute({
        paths: [filePath],
        encoding: 'utf-8'
      });

      expect(result[0].content).toBe(content);
    });

    it('should preserve special characters', async () => {
      const filePath = join(testDir, 'special.txt');
      const content = 'Tab:\t Newline:\n Quote:" Backslash:\\';

      const writeResult = await writeFilesExecute({
        files: [{ path: filePath, content }]
      });
      expect(writeResult[0].success).toBe(true);

      const readResult = await readFilesExecute({ paths: [filePath] });
      expect(readResult[0].content).toBe(content);
    });
  });

  describe('empty files', () => {
    it('should read empty files', async () => {
      const filePath = join(testDir, 'empty.txt');
      await writeFile(filePath, '');

      const result = await readFilesExecute({ paths: [filePath] });

      expect(result[0].content).toBe('');
      expect(result[0].error).toBeUndefined();
    });

    it('should write empty content', async () => {
      const filePath = join(testDir, 'empty_new.txt');

      const result = await writeFilesExecute({
        files: [{ path: filePath, content: '' }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('');
    });
  });

  describe('nested directories', () => {
    it('should create deeply nested directories', async () => {
      const deepPath = join(testDir, 'a', 'b', 'c', 'd', 'e', 'file.txt');

      const result = await writeFilesExecute({
        files: [{ path: deepPath, content: 'deep' }]
      });

      expect(result[0].success).toBe(true);
      expect(existsSync(deepPath)).toBe(true);
    });

    it('should read from nested directories', async () => {
      const nestedDir = join(testDir, 'nested', 'dir');
      await mkdir(nestedDir, { recursive: true });
      const filePath = join(nestedDir, 'file.txt');
      await writeFile(filePath, 'nested content');

      const result = await readFilesExecute({ paths: [filePath] });

      expect(result[0].content).toBe('nested content');
    });
  });

  describe('file size handling', () => {
    it('should handle reasonably large files', async () => {
      const filePath = join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(100000); // 100KB

      await writeFile(filePath, largeContent);

      const result = await readFilesExecute({ paths: [filePath] });

      expect(result[0].content?.length).toBe(100000);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent reads', async () => {
      const files = ['file1.txt', 'file2.txt', 'file3.txt'];
      const paths = files.map(f => join(testDir, f));

      for (const p of paths) {
        await writeFile(p, `content of ${p}`);
      }

      const result = await readFilesExecute({ paths });

      expect(result).toHaveLength(3);
      result.forEach(r => {
        expect(r.content).toBeDefined();
        expect(r.error).toBeUndefined();
      });
    });
  });
});
