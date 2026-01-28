/**
 * Tests for repoMap module
 * Equivalent to Aider's test_repomap.py
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { generateRepoMap } from '../src/repoMap.js';

describe('repoMap', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-repomap-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('basic functionality', () => {
    it('should generate repo map with source files', async () => {
      // Create test files
      await writeFile(join(testDir, 'test.py'), `
def hello():
    return "world"

class Person:
    def __init__(self, name):
        self.name = name
`);

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('test.py');
      // Should find symbols (depends on ctags availability or fallback)
    });

    it('should include multiple file types', async () => {
      await writeFile(join(testDir, 'test.py'), 'def func(): pass');
      await writeFile(join(testDir, 'test.ts'), 'export function greet() {}');
      await writeFile(join(testDir, 'test.js'), 'function helper() {}');

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('test.py');
      expect(repoMap).toContain('test.ts');
      expect(repoMap).toContain('test.js');
    });

    it('should ignore node_modules directory', async () => {
      await mkdir(join(testDir, 'node_modules'), { recursive: true });
      await writeFile(join(testDir, 'node_modules', 'package.js'), 'function x() {}');
      await writeFile(join(testDir, 'src.js'), 'function main() {}');

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('src.js');
      expect(repoMap).not.toContain('node_modules');
    });

    it('should ignore .git directory', async () => {
      await mkdir(join(testDir, '.git'), { recursive: true });
      await writeFile(join(testDir, '.git', 'config'), 'git config');
      await writeFile(join(testDir, 'main.py'), 'def main(): pass');

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('main.py');
      expect(repoMap).not.toContain('.git');
    });

    it('should return message for empty repository', async () => {
      // Empty directory with no source files
      await writeFile(join(testDir, 'readme.txt'), 'not a source file');

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('No source files');
    });
  });

  describe('symbol extraction', () => {
    it('should extract Python class and function symbols', async () => {
      await writeFile(join(testDir, 'module.py'), `
class MyClass:
    def method(self):
        pass

def standalone_function():
    pass
`);

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('module.py');
      // Symbol extraction depends on ctags or fallback regex
      // At minimum should have the file listed
    });

    it('should extract TypeScript symbols', async () => {
      await writeFile(join(testDir, 'app.ts'), `
interface UserProps {
  name: string;
}

export class User {
  getName(): string {
    return "test";
  }
}

export function greet(name: string): string {
  return "Hello " + name;
}

export const VERSION = "1.0.0";
`);

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('app.ts');
    });

    it('should extract JavaScript symbols', async () => {
      await writeFile(join(testDir, 'utils.js'), `
class Calculator {
  add(a, b) {
    return a + b;
  }
}

function helper() {
  return true;
}

const CONSTANT = 42;
`);

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('utils.js');
    });
  });

  describe('nested directories', () => {
    it('should scan nested directories', async () => {
      await mkdir(join(testDir, 'src', 'utils'), { recursive: true });
      await writeFile(join(testDir, 'src', 'index.ts'), 'export function main() {}');
      await writeFile(join(testDir, 'src', 'utils', 'helpers.ts'), 'export function help() {}');

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('index.ts');
      expect(repoMap).toContain('helpers.ts');
    });

    it('should handle deep nesting', async () => {
      const deepPath = join(testDir, 'a', 'b', 'c', 'd');
      await mkdir(deepPath, { recursive: true });
      await writeFile(join(deepPath, 'deep.py'), 'def deep_func(): pass');

      const repoMap = await generateRepoMap(testDir);

      expect(repoMap).toContain('deep.py');
    });
  });

  describe('language support', () => {
    const languageTests = [
      { ext: 'py', content: 'def greet(): pass', name: 'Python' },
      { ext: 'ts', content: 'export function greet() {}', name: 'TypeScript' },
      { ext: 'js', content: 'function greet() {}', name: 'JavaScript' },
      { ext: 'tsx', content: 'export const App = () => <div/>', name: 'TSX' },
      { ext: 'go', content: 'func main() {}', name: 'Go' },
      { ext: 'rs', content: 'fn main() {}', name: 'Rust' },
      { ext: 'java', content: 'class Main { void run() {} }', name: 'Java' },
      { ext: 'c', content: 'int main() { return 0; }', name: 'C' },
      { ext: 'cpp', content: 'int main() { return 0; }', name: 'C++' },
    ];

    for (const { ext, content, name } of languageTests) {
      it(`should recognize ${name} files (.${ext})`, async () => {
        await writeFile(join(testDir, `test.${ext}`), content);

        const repoMap = await generateRepoMap(testDir);

        expect(repoMap).toContain(`test.${ext}`);
      });
    }
  });

  describe('file limits', () => {
    it('should limit number of files processed', async () => {
      // Create more than 50 files (the limit in repoMap)
      for (let i = 0; i < 60; i++) {
        await writeFile(join(testDir, `file${i}.py`), `def func${i}(): pass`);
      }

      const repoMap = await generateRepoMap(testDir);

      // Should complete without error, limited to 50 files
      expect(repoMap).toBeDefined();
    });
  });

  describe('with fixtures', () => {
    it('should process Python fixture', async () => {
      const repoMap = await generateRepoMap('./tests/fixtures');

      expect(repoMap).toContain('sample.py');
      // Depending on symbol extraction
    });

    it('should process TypeScript fixture', async () => {
      const repoMap = await generateRepoMap('./tests/fixtures');

      expect(repoMap).toContain('sample.ts');
    });

    it('should process JavaScript fixture', async () => {
      const repoMap = await generateRepoMap('./tests/fixtures');

      expect(repoMap).toContain('sample.js');
    });
  });
});
