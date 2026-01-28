/**
 * Tests for file watcher
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm, appendFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import { FileWatcher, createFileWatcher } from '../src/watcher.js';

describe('FileWatcher', () => {
  let testDir: string;
  let watcher: FileWatcher | null = null;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-watcher-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (watcher) {
      watcher.stop();
      watcher = null;
    }
    await rm(testDir, { recursive: true, force: true });
  });

  describe('AI comment detection', () => {
    it('should detect AI! comments', async () => {
      const filePath = join(testDir, 'test.py');
      await writeFile(filePath, '# ai! please fix this bug\nprint("hello")');

      const comments: any[] = [];
      watcher = new FileWatcher({
        root: testDir,
        onAIComment: (path, c) => comments.push({ path, comments: c }),
      });

      // Manually trigger the AI comment detection
      const privateWatcher = watcher as any;
      const extracted = await privateWatcher.extractAIComments(filePath);

      expect(extracted.length).toBe(1);
      expect(extracted[0].action).toBe('request');
      expect(extracted[0].line).toBe(1);
    });

    it('should detect AI? comments', async () => {
      const filePath = join(testDir, 'test.js');
      await writeFile(filePath, '// ai? what does this do\nconst x = 1;');

      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;
      const extracted = await privateWatcher.extractAIComments(filePath);

      expect(extracted.length).toBe(1);
      expect(extracted[0].action).toBe('question');
    });

    it('should detect multiple AI comments', async () => {
      const filePath = join(testDir, 'multi.py');
      await writeFile(filePath, `
# ai! fix this
def foo():
    pass
# ai? is this correct
# ai add logging
`);

      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;
      const extracted = await privateWatcher.extractAIComments(filePath);

      expect(extracted.length).toBe(3);
    });

    it('should detect different comment styles', async () => {
      const pyFile = join(testDir, 'test.py');
      const jsFile = join(testDir, 'test.js');
      const sqlFile = join(testDir, 'test.sql');

      await writeFile(pyFile, '# ai! python');
      await writeFile(jsFile, '// ai! javascript');
      await writeFile(sqlFile, '-- ai! sql');

      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;

      const pyComments = await privateWatcher.extractAIComments(pyFile);
      const jsComments = await privateWatcher.extractAIComments(jsFile);
      const sqlComments = await privateWatcher.extractAIComments(sqlFile);

      expect(pyComments.length).toBe(1);
      expect(jsComments.length).toBe(1);
      expect(sqlComments.length).toBe(1);
    });
  });

  describe('ignore patterns', () => {
    it('should ignore node_modules', async () => {
      await mkdir(join(testDir, 'node_modules', 'pkg'), { recursive: true });
      await writeFile(join(testDir, 'node_modules', 'pkg', 'index.js'), '// ai! test');

      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;

      const shouldIgnore = privateWatcher.shouldIgnore('node_modules/pkg/index.js');
      expect(shouldIgnore).toBe(true);
    });

    it('should ignore .git directory', async () => {
      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;

      const shouldIgnore = privateWatcher.shouldIgnore('.git/config');
      expect(shouldIgnore).toBe(true);
    });

    it('should ignore backup files', async () => {
      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;

      expect(privateWatcher.shouldIgnore('file.txt~')).toBe(true);
      expect(privateWatcher.shouldIgnore('file.txt.swp')).toBe(true);
      expect(privateWatcher.shouldIgnore('file.txt.bak')).toBe(true);
    });

    it('should not ignore regular files', async () => {
      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;

      expect(privateWatcher.shouldIgnore('src/main.ts')).toBe(false);
      expect(privateWatcher.shouldIgnore('test.py')).toBe(false);
    });

    it('should apply custom ignore patterns', async () => {
      watcher = new FileWatcher({
        root: testDir,
        ignorePatterns: [/custom_ignore/],
      });
      const privateWatcher = watcher as any;

      expect(privateWatcher.shouldIgnore('custom_ignore/file.txt')).toBe(true);
    });
  });

  describe('actionable comments', () => {
    it('should track actionable comments', async () => {
      const filePath = join(testDir, 'actionable.py');
      await writeFile(filePath, '# ai! fix this\n# ai note');

      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;

      // Simulate file being watched
      const comments = await privateWatcher.extractAIComments(filePath);
      privateWatcher.watchedFiles.set(filePath, {
        path: filePath,
        lastModified: Date.now(),
        aiComments: comments,
      });

      
      expect(watcher.hasActionableComments()).toBe(true);
    });

    it('should format actionable comments for prompt', async () => {
      const filePath = join(testDir, 'prompt.py');
      await writeFile(filePath, '# ai! implement this function');

      watcher = new FileWatcher({ root: testDir });
      const privateWatcher = watcher as any;

      const comments = await privateWatcher.extractAIComments(filePath);
      privateWatcher.watchedFiles.set(filePath, {
        path: filePath,
        lastModified: Date.now(),
        aiComments: comments,
      });

      const prompt = watcher.getActionableCommentsPrompt();

      expect(prompt).toContain('AI comments');
      expect(prompt).toContain('implement this function');
    });
  });

  describe('start/stop', () => {
    it('should start and stop without errors', () => {
      watcher = new FileWatcher({ root: testDir });

      expect(() => watcher!.start()).not.toThrow();
      expect(() => watcher!.stop()).not.toThrow();
    });

    it('should handle multiple start calls', () => {
      watcher = new FileWatcher({ root: testDir });

      watcher.start();
      expect(() => watcher!.start()).not.toThrow(); // Should be idempotent
    });

    it('should handle multiple stop calls', () => {
      watcher = new FileWatcher({ root: testDir });

      watcher.start();
      watcher.stop();
      expect(() => watcher!.stop()).not.toThrow();
    });
  });

  describe('event emission', () => {
    it('should emit file-change events', (done) => {
      watcher = new FileWatcher({ root: testDir });

      watcher.on('file-change', (path, type) => {
        expect(path).toBeDefined();
        expect(['add', 'change', 'unlink']).toContain(type);
        done();
      });

      watcher.start();

      // Trigger a file change
      setTimeout(async () => {
        await writeFile(join(testDir, 'new-file.txt'), 'content');
      }, 100);
    }, 5000);

    it('should emit ai-comment events', (done) => {
      watcher = new FileWatcher({ root: testDir });

      watcher.on('ai-comment', (path, comments) => {
        expect(comments.length).toBeGreaterThan(0);
        done();
      });

      watcher.start();

      setTimeout(async () => {
        await writeFile(join(testDir, 'ai-file.py'), '# ai! test comment');
      }, 100);
    }, 5000);
  });

  describe('createFileWatcher helper', () => {
    it('should create and start watcher', () => {
      watcher = createFileWatcher({ root: testDir });
      expect(watcher).toBeInstanceOf(FileWatcher);
    });
  });
});
