
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

  it('should apply git-style merge diff', async () => {
    const filePath = join(testDir, 'diff_test.txt');
    await writeFile(filePath, 'line 1\nline 2\nline 3\nline 4\n');

    const diff = `<<<<<<< SEARCH
line 2
line 3
=======
line 2 modified
line 3 modified
>>>>>>> REPLACE
`;

    const result = await execute({
      files: [{
        path: filePath,
        diff: diff
      } as any]
    });

    expect(result[0].success).toBe(true);
    const content = await readFile(filePath, 'utf-8');
    expect(content).toContain('line 2 modified');
    expect(content).not.toContain('line 2\nline 3');
  });

  it('should validate schema with diff', () => {
      expect(() => schema.parse({
          files: [{ path: 'test.txt', diff: 'some diff' }]
      })).not.toThrow();
  });
});
