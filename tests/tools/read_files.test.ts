/**
 * Tests for readFiles tool
 * Equivalent to Aider's test patterns and GeminiCLI's file-system.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFiles } from '../../src/builtins.js';

const { execute, inputSchema: schema } = readFiles;

describe('read_files', () => {
  let testDir: string;

  beforeEach(async () => {
    // Use a directory inside the workspace to pass security checks
    testDir = join(process.cwd(), '.test_tmp', `simple-cli-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should read a single file successfully', async () => {
    const filePath = join(testDir, 'test.txt');
    const content = 'hello world';
    await writeFile(filePath, content);

    const result = await execute({ paths: [filePath] });

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(filePath);
    expect(result[0].content).toBe(content);
    expect(result[0].error).toBeUndefined();
  });

  it('should read multiple files', async () => {
    const file1 = join(testDir, 'file1.txt');
    const file2 = join(testDir, 'file2.txt');
    await writeFile(file1, 'content1');
    await writeFile(file2, 'content2');

    const result = await execute({ paths: [file1, file2] });

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('content1');
    expect(result[1].content).toBe('content2');
  });

  it('should handle non-existent file gracefully', async () => {
    const filePath = join(testDir, 'non_existent.txt');

    const result = await execute({ paths: [filePath] });

    expect(result).toHaveLength(1);
    expect(result[0].path).toBe(filePath);
    expect(result[0].content).toBeUndefined();
    expect(result[0].error).toBeDefined();
    expect(result[0].error).toContain('File not found');
  });

  it('should read files with different encodings', async () => {
    const filePath = join(testDir, 'utf8.txt');
    const content = 'Hello 世界 🌍';
    await writeFile(filePath, content, 'utf-8');

    // Tool doesn't support encoding param anymore, defaults to utf-8 which handles this fine
    const result = await execute({ paths: [filePath] });

    expect(result[0].content).toBe(content);
  });

  it('should handle mixed existing and non-existing files', async () => {
    const existingFile = join(testDir, 'exists.txt');
    const nonExistingFile = join(testDir, 'not_exists.txt');
    await writeFile(existingFile, 'I exist');

    const result = await execute({ paths: [existingFile, nonExistingFile] });

    expect(result).toHaveLength(2);
    expect(result[0].content).toBe('I exist');
    expect(result[0].error).toBeUndefined();
    expect(result[1].content).toBeUndefined();
    expect(result[1].error).toBeDefined();
  });

  it('should read empty files', async () => {
    const filePath = join(testDir, 'empty.txt');
    await writeFile(filePath, '');

    const result = await execute({ paths: [filePath] });

    expect(result[0].content).toBe('');
    expect(result[0].error).toBeUndefined();
  });

  it('should handle file paths with spaces', async () => {
    const filePath = join(testDir, 'file with spaces.txt');
    await writeFile(filePath, 'content with spaces');

    const result = await execute({ paths: [filePath] });

    expect(result[0].content).toBe('content with spaces');
  });

  it('should validate input schema', () => {
    // Valid input
    expect(() => schema.parse({ paths: ['file.txt'] })).not.toThrow();

    // Invalid input - missing paths
    expect(() => schema.parse({})).toThrow();

    // Invalid input - paths not an array
    expect(() => schema.parse({ paths: 'file.txt' })).toThrow();
  });

  it('should read files in nested directories', async () => {
    const nestedDir = join(testDir, 'nested', 'dir');
    await mkdir(nestedDir, { recursive: true });
    const filePath = join(nestedDir, 'deep.txt');
    await writeFile(filePath, 'deep content');

    const result = await execute({ paths: [filePath] });

    expect(result[0].content).toBe('deep content');
  });
});
