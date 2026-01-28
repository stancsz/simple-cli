/**
 * Tests for glob tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { execute, tool } from '../../src/tools/glob.js';

describe('glob tool', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-glob-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('glob');
    });

    it('should have correct permission', () => {
      expect(tool.permission).toBe('read');
    });
  });

  describe('basic patterns', () => {
    it('should match files with extension', async () => {
      await writeFile(join(testDir, 'file1.ts'), '');
      await writeFile(join(testDir, 'file2.ts'), '');
      await writeFile(join(testDir, 'file3.js'), '');

      const result = await execute({ pattern: '*.ts', cwd: testDir });

      expect(result.matches).toContain('file1.ts');
      expect(result.matches).toContain('file2.ts');
      expect(result.matches).not.toContain('file3.js');
    });

    it('should match all files with *', async () => {
      await writeFile(join(testDir, 'a.txt'), '');
      await writeFile(join(testDir, 'b.txt'), '');

      const result = await execute({ pattern: '*', cwd: testDir });

      expect(result.matches).toContain('a.txt');
      expect(result.matches).toContain('b.txt');
    });

    it('should match single character with ?', async () => {
      await writeFile(join(testDir, 'file1.txt'), '');
      await writeFile(join(testDir, 'file2.txt'), '');
      await writeFile(join(testDir, 'file10.txt'), '');

      const result = await execute({ pattern: 'file?.txt', cwd: testDir });

      expect(result.matches).toContain('file1.txt');
      expect(result.matches).toContain('file2.txt');
      expect(result.matches).not.toContain('file10.txt');
    });
  });

  describe('recursive patterns', () => {
    it('should match files in subdirectories with **', async () => {
      await mkdir(join(testDir, 'sub1'));
      await mkdir(join(testDir, 'sub2', 'nested'), { recursive: true });

      await writeFile(join(testDir, 'root.ts'), '');
      await writeFile(join(testDir, 'sub1', 'sub1.ts'), '');
      await writeFile(join(testDir, 'sub2', 'nested', 'deep.ts'), '');

      const result = await execute({ pattern: '**/*.ts', cwd: testDir });

      expect(result.matches).toContain('root.ts');
      expect(result.matches.some(m => m.includes('sub1.ts'))).toBe(true);
      expect(result.matches.some(m => m.includes('deep.ts'))).toBe(true);
    });

    it('should match specific subdirectory', async () => {
      await mkdir(join(testDir, 'src'));
      await mkdir(join(testDir, 'tests'));

      await writeFile(join(testDir, 'src', 'main.ts'), '');
      await writeFile(join(testDir, 'tests', 'test.ts'), '');

      const result = await execute({ pattern: 'src/*.ts', cwd: testDir });

      expect(result.matches.some(m => m.includes('main.ts'))).toBe(true);
      expect(result.matches.some(m => m.includes('test.ts'))).toBe(false);
    });
  });

  describe('ignore patterns', () => {
    it('should ignore node_modules by default', async () => {
      await mkdir(join(testDir, 'node_modules', 'pkg'), { recursive: true });
      await writeFile(join(testDir, 'node_modules', 'pkg', 'index.js'), '');
      await writeFile(join(testDir, 'app.js'), '');

      const result = await execute({ pattern: '**/*.js', cwd: testDir });

      expect(result.matches).toContain('app.js');
      expect(result.matches.some(m => m.includes('node_modules'))).toBe(false);
    });

    it('should ignore .git by default', async () => {
      await mkdir(join(testDir, '.git', 'objects'), { recursive: true });
      await writeFile(join(testDir, '.git', 'config'), '');
      await writeFile(join(testDir, 'src.txt'), '');

      const result = await execute({ pattern: '**/*', cwd: testDir });

      expect(result.matches).toContain('src.txt');
      expect(result.matches.some(m => m.includes('.git'))).toBe(false);
    });

    it('should apply custom ignore patterns', async () => {
      await mkdir(join(testDir, 'dist'));
      await writeFile(join(testDir, 'dist', 'bundle.js'), '');
      await writeFile(join(testDir, 'src.js'), '');

      const result = await execute({
        pattern: '**/*.js',
        cwd: testDir,
        ignore: ['dist'],
      });

      expect(result.matches).toContain('src.js');
      expect(result.matches.some(m => m.includes('dist'))).toBe(false);
    });
  });

  describe('result limiting', () => {
    it('should limit results to maxResults', async () => {
      for (let i = 0; i < 20; i++) {
        await writeFile(join(testDir, `file${i}.txt`), '');
      }

      const result = await execute({
        pattern: '*.txt',
        cwd: testDir,
        maxResults: 5,
      });

      expect(result.matches.length).toBe(5);
      expect(result.truncated).toBe(true);
    });

    it('should not truncate when under limit', async () => {
      await writeFile(join(testDir, 'a.txt'), '');
      await writeFile(join(testDir, 'b.txt'), '');

      const result = await execute({
        pattern: '*.txt',
        cwd: testDir,
        maxResults: 100,
      });

      expect(result.count).toBe(2);
      expect(result.truncated).toBe(false);
    });
  });

  describe('directories option', () => {
    it('should exclude directories by default', async () => {
      await mkdir(join(testDir, 'subdir'));
      await writeFile(join(testDir, 'file.txt'), '');

      const result = await execute({
        pattern: '*',
        cwd: testDir,
        includeDirectories: false,
      });

      expect(result.matches).toContain('file.txt');
      expect(result.matches).not.toContain('subdir');
    });

    it('should include directories when option is true', async () => {
      await mkdir(join(testDir, 'mydir'));
      await writeFile(join(testDir, 'file.txt'), '');

      const result = await execute({
        pattern: '*',
        cwd: testDir,
        includeDirectories: true,
      });

      expect(result.matches).toContain('file.txt');
      expect(result.matches).toContain('mydir');
    });
  });

  describe('empty results', () => {
    it('should return empty array when no matches', async () => {
      await writeFile(join(testDir, 'file.txt'), '');

      const result = await execute({ pattern: '*.js', cwd: testDir });

      expect(result.matches).toEqual([]);
      expect(result.count).toBe(0);
    });
  });
});
