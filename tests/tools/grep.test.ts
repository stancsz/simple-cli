/**
 * Tests for grep tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { searchFiles } from '../../src/builtins.js';

const { execute } = searchFiles;
const tool = searchFiles;

// Default options for direct execute calls
const defaults = {
    glob: '**/*',
    ignoreCase: false,
    contextLines: 0,
    filesOnly: false
};

describe('grep tool', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-grep-test-${Date.now()}-${Math.random()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('search_files');
    });
  });

  describe('basic search', () => {
    it('should find pattern in file', async () => {
      await writeFile(join(testDir, 'test.txt'), 'Hello World\nGoodbye World');

      const result = await execute({ ...defaults, pattern: 'Hello', path: testDir });

      expect(result.count).toBe(1);
      expect(result.matches[0].text).toContain('Hello');
      expect(result.matches[0].line).toBe(1);
    });

    it('should find multiple matches', async () => {
      await writeFile(join(testDir, 'test.txt'), 'foo bar\nfoo baz\nbar foo');

      const result = await execute({ ...defaults, pattern: 'foo', path: testDir });

      expect(result.count).toBe(3);
    });

    it('should return file paths', async () => {
      await writeFile(join(testDir, 'a.txt'), 'match here');
      await writeFile(join(testDir, 'b.txt'), 'match here too');

      const result = await execute({ ...defaults, pattern: 'match', path: testDir });

      expect(result.files.length).toBe(2);
    });
  });

  describe('regex patterns', () => {
    it('should match regex patterns', async () => {
      await writeFile(join(testDir, 'test.txt'), 'foo123 bar456');

      const result = await execute({ ...defaults, pattern: '\\d+', path: testDir });

      expect(result.count).toBeGreaterThan(0);
    });

    it('should match word boundaries', async () => {
      await writeFile(join(testDir, 'test.txt'), 'foo food foolish');

      const result = await execute({ ...defaults, pattern: '\\bfoo\\b', path: testDir });

      expect(result.matches[0].match).toBe('foo');
    });
  });

  describe('case sensitivity', () => {
    it('should be case sensitive by default', async () => {
      await writeFile(join(testDir, 'test.txt'), 'Hello HELLO hello');

      const result = await execute({
        ...defaults,
        pattern: 'Hello',
        path: testDir,
        ignoreCase: false,
      });

      expect(result.count).toBe(1);
    });

    it('should ignore case when option is true', async () => {
      await writeFile(join(testDir, 'test.txt'), 'Hello HELLO hello');

      const result = await execute({
        ...defaults,
        pattern: 'hello',
        path: testDir,
        ignoreCase: true,
      });

      expect(result.count).toBe(3);
    });
  });

  describe('file filtering', () => {
    it('should filter by glob pattern', async () => {
      await writeFile(join(testDir, 'test.ts'), 'const match = 1;');
      await writeFile(join(testDir, 'test.js'), 'const match = 2;');

      const result = await execute({
        ...defaults,
        pattern: 'match',
        path: testDir,
        glob: '*.ts',
      });

      expect(result.files.length).toBe(1);
      expect(result.files[0]).toContain('.ts');
    });

    it('should ignore binary files', async () => {
      await writeFile(join(testDir, 'text.txt'), 'searchable');
      await writeFile(join(testDir, 'binary.exe'), Buffer.from([0x00, 0x01, 0x02]));

      const result = await execute({ ...defaults, pattern: 'searchable', path: testDir });

      expect(result.matches.length).toBe(1);
    });
  });

  describe('context lines', () => {
    it('should include context lines', async () => {
      await writeFile(
        join(testDir, 'test.txt'),
        'line1\nline2\nmatch\nline4\nline5'
      );

      const result = await execute({
        ...defaults,
        pattern: 'match',
        path: testDir,
        contextLines: 1,
      });

      expect(result.matches[0].contextBefore).toContain('line2');
      expect(result.matches[0].contextAfter).toContain('line4');
    });
  });

  describe('files only mode', () => {
    it('should return only file names', async () => {
      await writeFile(join(testDir, 'a.txt'), 'match');
      await writeFile(join(testDir, 'b.txt'), 'match');

      const result = await execute({
        ...defaults,
        pattern: 'match',
        path: testDir,
        filesOnly: true,
      });

      expect(result.files.length).toBe(2);
      expect(result.matches.length).toBe(0);
    });
  });

  describe('result limiting', () => {
    it('should limit results', async () => {
      let content = '';
      for (let i = 0; i < 50; i++) {
        content += `match line ${i}\n`;
      }
      await writeFile(join(testDir, 'test.txt'), content);

      const result = await execute({
        ...defaults,
        pattern: 'match',
        path: testDir,
        maxResults: 10,
      });

      expect(result.matches.length).toBe(10);
      expect(result.truncated).toBe(true);
    });
  });

  describe('subdirectory search', () => {
    it('should search recursively', async () => {
      await mkdir(join(testDir, 'sub'));
      await writeFile(join(testDir, 'root.txt'), 'match');
      await writeFile(join(testDir, 'sub', 'nested.txt'), 'match');

      const result = await execute({ ...defaults, pattern: 'match', path: testDir });

      expect(result.files.length).toBe(2);
    });

    it('should ignore node_modules', async () => {
      await mkdir(join(testDir, 'node_modules', 'pkg'), { recursive: true });
      await writeFile(join(testDir, 'node_modules', 'pkg', 'index.js'), 'match');
      await writeFile(join(testDir, 'app.js'), 'match');

      const result = await execute({ ...defaults, pattern: 'match', path: testDir });

      expect(result.files.length).toBe(1);
      expect(result.files[0]).not.toContain('node_modules');
    });
  });

  describe('single file search', () => {
    it('should search single file', async () => {
      const filePath = join(testDir, 'single.txt');
      await writeFile(filePath, 'line1\nmatch\nline3');

      const result = await execute({ ...defaults, pattern: 'match', path: filePath });

      expect(result.count).toBe(1);
      expect(result.matches[0].line).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle non-existent path', async () => {
      const result = await execute({
        ...defaults,
        pattern: 'test',
        path: join(testDir, 'nonexistent'),
      });

      expect(result.matches).toEqual([]);
      expect(result.count).toBe(0);
    });

    it('should handle invalid regex', async () => {
      await writeFile(join(testDir, 'test.txt'), 'content');

      // execute function in builtins.ts creates `new RegExp(pattern)`.
      // If pattern is invalid, it throws SyntaxError.
      // My implementation doesn't wrap RegExp creation in try/catch?
      // Let's check builtins.ts code.
      // `const lineRegex = new RegExp(pattern, ignoreCase ? 'i' : '');`
      // This is outside the `try` block for file reading loop?
      // In `builtins.ts`:
      // `const lineRegex = new RegExp(pattern, ...);` is AFTER glob.
      // And NOT in a try block.
      // So it will throw.
      // `expect(...).rejects.toThrow()` should catch it.

      await expect(
        execute({ ...defaults, pattern: '[invalid', path: testDir })
      ).rejects.toThrow();
    });
  });
});
