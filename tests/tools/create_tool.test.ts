
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm, readFile, stat } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { existsSync } from 'fs';
import { createTool } from '../../src/builtins.js';

const { execute } = createTool;
const originalCwd = process.cwd();
let testDataDir: string;

describe('create_tool tool', () => {
  beforeEach(async () => {
    testDataDir = join(tmpdir(), `simple-cli-create-tool-test-${Date.now()}-${Math.random()}`);
    await import('fs/promises').then(fs => fs.mkdir(testDataDir, { recursive: true }));
    process.chdir(testDataDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    try {
      if (testDataDir) {
        await rm(testDataDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('should create a local tool', async () => {
    // Create a dummy source file
    const sourcePath = 'my_script.js';
    await import('fs/promises').then(fs => fs.writeFile(sourcePath, 'console.log("Hello");'));

    const result = await execute({
      source_path: sourcePath,
      name: 'hello_world',
      description: 'Prints hello',
      usage: 'hello_world',
      scope: 'local'
    });

    expect(result).toContain('successfully saved');

    const toolFile = join(testDataDir, '.agent', 'tools', 'hello_world.js');
    expect(existsSync(toolFile)).toBe(true);

    const content = await readFile(toolFile, 'utf-8');
    expect(content).toContain('/**');
    expect(content).toContain('hello_world');
    expect(content).toContain('console.log("Hello");');
  });

  it('should handle python scripts', async () => {
      const sourcePath = 'script.py';
      await import('fs/promises').then(fs => fs.writeFile(sourcePath, 'print("Hello")'));

      await execute({
          source_path: sourcePath,
          name: 'py_hello',
          description: 'Python hello',
          usage: 'py_hello',
          scope: 'local'
      });

      const toolFile = join(testDataDir, '.agent', 'tools', 'py_hello.py');
      expect(existsSync(toolFile)).toBe(true);
      const content = await readFile(toolFile, 'utf-8');
      expect(content).toContain('"""');
      expect(content).toContain('Python hello');
  });
});
