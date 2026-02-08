/**
 * Tests for edit block parsing and application
 * Equivalent to Aider's test_editblock.py
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { writeFiles } from '../src/builtins.js';

describe('editBlock', () => {
  let testDir: string;
  // Use workspace-relative path to pass isPathAllowed check
  const baseTestDir = resolve(process.cwd(), '.test_tmp');

  beforeEach(async () => {
    testDir = join(baseTestDir, `editblock-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('search/replace operations', () => {
    it('should replace content in file', async () => {
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'Hello World');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'World', replace: 'Universe' }]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('Hello Universe');
    });

    it('should handle multiple search/replace in same file', async () => {
      const filePath = join(testDir, 'multi.txt');
      await writeFile(filePath, 'one two three');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [
            { search: 'one', replace: 'ONE' },
            { search: 'three', replace: 'THREE' }
          ]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('ONE two THREE');
    });

    it('should preserve whitespace when replacing', async () => {
      const filePath = join(testDir, 'whitespace.txt');
      await writeFile(filePath, '    line1\n    line2\n    line3');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'line2', replace: 'modified' }]
        }]
      });

      expect(result[0].success).toBe(true);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('    line1\n    modified\n    line3');
    });

    it('should replace all occurrences', async () => {
      const filePath = join(testDir, 'all_occurrences.txt');
      await writeFile(filePath, 'foo bar foo baz foo');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'foo', replace: 'FOO' }]
        }]
      });

      expect(result[0].success).toBe(true);
      // All occurrences replaced
      expect(await readFile(filePath, 'utf-8')).toBe('FOO bar FOO baz FOO');
    });

    it('should handle multiline search/replace', async () => {
      const filePath = join(testDir, 'multiline.py');
      await writeFile(filePath, `def old_function():
    return 1

def other():
    pass`);

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: 'def old_function():\n    return 1',
            replace: 'def new_function():\n    return 42'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('def new_function()');
      expect(content).toContain('return 42');
    });

    it('should fail when search pattern not found', async () => {
      const filePath = join(testDir, 'no_match.txt');
      await writeFile(filePath, 'original content');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'not_present', replace: 'replacement' }]
        }]
      });

      expect(result[0].success).toBe(false);
      // Original file unchanged
      expect(await readFile(filePath, 'utf-8')).toBe('original content');
    });

    it('should handle special regex characters literally', async () => {
      const filePath = join(testDir, 'regex.txt');
      await writeFile(filePath, 'value = arr[0]');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{ search: 'arr[0]', replace: 'arr[1]' }]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('value = arr[1]');
    });

    it('should handle empty search result in creation', async () => {
      const filePath = join(testDir, 'new_file.txt');

      // Creating new file with full content
      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          content: 'brand new content'
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('brand new content');
    });
  });

  describe('code block handling', () => {
    it('should handle Python code edits', async () => {
      const filePath = join(testDir, 'script.py');
      await writeFile(filePath, `class MyClass:
    def my_method(self, arg1, arg2):
        return arg1 + arg2

def my_function(arg1, arg2):
    return arg1 * arg2
`);

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: '        return arg1 + arg2',
            replace: '        return arg1 - arg2'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('return arg1 - arg2');
    });

    it('should handle TypeScript code edits', async () => {
      const filePath = join(testDir, 'component.tsx');
      await writeFile(filePath, `interface Props {
  name: string;
}

export const Component = ({ name }: Props) => {
  return <div>Hello {name}</div>;
};
`);

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: 'return <div>Hello {name}</div>;',
            replace: 'return <div>Welcome {name}!</div>;'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('Welcome {name}!');
    });

    it('should handle JSON edits', async () => {
      const filePath = join(testDir, 'config.json');
      await writeFile(filePath, `{
  "name": "my-app",
  "version": "1.0.0"
}`);

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: '"version": "1.0.0"',
            replace: '"version": "2.0.0"'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('"version": "2.0.0"');
    });
  });

  describe('edge cases', () => {
    it('should handle file with backticks in content', async () => {
      const filePath = join(testDir, 'backticks.md');
      await writeFile(filePath, '```python\nprint("hello")\n```');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: 'print("hello")',
            replace: 'print("world")'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      const content = await readFile(filePath, 'utf-8');
      expect(content).toContain('print("world")');
    });

    it('should handle unicode content', async () => {
      const filePath = join(testDir, 'unicode.txt');
      await writeFile(filePath, '你好世界 🌍');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: '世界',
            replace: '宇宙'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('你好宇宙 🌍');
    });

    it('should handle newline at end of file', async () => {
      const filePath = join(testDir, 'newline.txt');
      await writeFile(filePath, 'content\n');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: 'content',
            replace: 'modified'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('modified\n');
    });

    it('should handle empty lines in search', async () => {
      const filePath = join(testDir, 'empty_lines.txt');
      await writeFile(filePath, 'line1\n\nline3');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          searchReplace: [{
            search: 'line1\n\nline3',
            replace: 'line1\nline2\nline3'
          }]
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('line1\nline2\nline3');
    });
  });

  describe('full file writes', () => {
    it('should create new file with content', async () => {
      const filePath = join(testDir, 'brand_new.txt');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          content: 'new file content'
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('new file content');
    });

    it('should overwrite existing file completely', async () => {
      const filePath = join(testDir, 'overwrite.txt');
      await writeFile(filePath, 'old content that is very long');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          content: 'new'
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('new');
    });

    it('should create nested directories', async () => {
      const filePath = join(testDir, 'a', 'b', 'c', 'deep.txt');

      const result = await writeFiles.execute({
        files: [{
          path: filePath,
          content: 'deep content'
        }]
      });

      expect(result[0].success).toBe(true);
      expect(await readFile(filePath, 'utf-8')).toBe('deep content');
    });
  });
});
