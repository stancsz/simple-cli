
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, readFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execute, schema } from '../../src/tools/write_files.js';

describe('writeFiles with diff', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-diff-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should apply a single diff block', async () => {
    const filePath = join(testDir, 'diff_test.py');
    const originalContent = `def hello():
    print("Hello")

def world():
    print("World")
`;
    await writeFile(filePath, originalContent);

    const diff = `<<<<<<< SEARCH
def world():
    print("World")
=======
def world():
    print("Universe")
>>>>>>> REPLACE`;

    const result = await execute({
      files: [{
        path: filePath,
        diff: diff
      } as any]
    });

    expect(result[0].success).toBe(true);
    expect(await readFile(filePath, 'utf-8')).toBe(`def hello():
    print("Hello")

def world():
    print("Universe")
`);
  });

  it('should apply multiple diff blocks', async () => {
    const filePath = join(testDir, 'multi_diff.txt');
    await writeFile(filePath, '1\n2\n3\n4\n5');

    const diff = `<<<<<<< SEARCH
2
=======
two
>>>>>>> REPLACE
<<<<<<< SEARCH
4
=======
four
>>>>>>> REPLACE`;

    const result = await execute({
      files: [{
        path: filePath,
        diff: diff
      } as any]
    });

    expect(result[0].success).toBe(true);
    expect(await readFile(filePath, 'utf-8')).toBe('1\ntwo\n3\nfour\n5');
  });

  it('should fail if SEARCH block is not found', async () => {
    const filePath = join(testDir, 'fail_diff.txt');
    await writeFile(filePath, 'A\nB\nC');

    const diff = `<<<<<<< SEARCH
X
=======
Y
>>>>>>> REPLACE`;

    const result = await execute({
      files: [{
        path: filePath,
        diff: diff
      } as any]
    });

    expect(result[0].success).toBe(false);
    expect(result[0].message).toContain('Search block not found');
    expect(await readFile(filePath, 'utf-8')).toBe('A\nB\nC');
  });

  it('should handle special characters in replacement (safe replacement)', async () => {
    const filePath = join(testDir, 'special_chars.txt');
    await writeFile(filePath, 'var x = 1;');

    const diff = `<<<<<<< SEARCH
var x = 1;
=======
var x = "$HOME";
var y = \`\${foo}\`;
>>>>>>> REPLACE`;

    const result = await execute({
      files: [{
        path: filePath,
        diff: diff
      } as any]
    });

    expect(result[0].success).toBe(true);
    expect(await readFile(filePath, 'utf-8')).toBe('var x = "$HOME";\nvar y = `${foo}`;');
  });

  it('should normalize CRLF in file to LF during matching', async () => {
    const filePath = join(testDir, 'crlf.txt');
    // Write file with CRLF
    await writeFile(filePath, 'line1\r\nline2\r\nline3');

    // Diff uses LF (standard from tool/LLM)
    const diff = `<<<<<<< SEARCH
line2
=======
line_two
>>>>>>> REPLACE`;

    const result = await execute({
      files: [{
        path: filePath,
        diff: diff
      } as any]
    });

    expect(result[0].success).toBe(true);
    // Output should be normalized to LF (as per implementation)
    expect(await readFile(filePath, 'utf-8')).toBe('line1\nline_two\nline3');
  });
});
