/**
 * Tests for GitManager using simple-git
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';

import { GitManager, getGitManager, generateCommitMessage } from '../../src/lib/git.js';

describe('GitManager', () => {
  let testDir: string;
  let git: GitManager;
  let isGitAvailable = true;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-git-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    try {
      execSync('git init', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: 'pipe' });
      execSync('git config user.name "Test User"', { cwd: testDir, stdio: 'pipe' });
      git = new GitManager({ cwd: testDir });
    } catch {
      isGitAvailable = false;
    }
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('isRepo', () => {
    it('should return true for git repo', async () => {
      if (!isGitAvailable) return;

      const result = await git.isRepo();
      expect(result).toBe(true);
    });

    it('should return false for non-repo', async () => {
      const nonRepoDir = join(tmpdir(), `non-repo-${Date.now()}`);
      await mkdir(nonRepoDir, { recursive: true });
      const nonGit = new GitManager({ cwd: nonRepoDir });

      try {
        const result = await nonGit.isRepo();
        expect(result).toBe(false);
      } finally {
        await rm(nonRepoDir, { recursive: true, force: true });
      }
    });
  });

  describe('status', () => {
    it('should return status', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'test.txt'), 'content');

      const status = await git.status();

      expect(status.not_added).toContain('test.txt');
    });

    it('should show staged files', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'staged.txt'), 'content');
      await git.add('staged.txt');

      const status = await git.status();

      expect(status.created).toContain('staged.txt');
    });
  });

  describe('add', () => {
    it('should stage a file', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'file.txt'), 'content');
      await git.add('file.txt');

      const status = await git.status();
      expect(status.created).toContain('file.txt');
    });

    it('should stage multiple files', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'a.txt'), 'a');
      await writeFile(join(testDir, 'b.txt'), 'b');
      await git.add(['a.txt', 'b.txt']);

      const status = await git.status();
      expect(status.created).toContain('a.txt');
      expect(status.created).toContain('b.txt');
    });
  });

  describe('addAll', () => {
    it('should stage all changes', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'x.txt'), 'x');
      await writeFile(join(testDir, 'y.txt'), 'y');
      await git.addAll();

      const status = await git.status();
      expect(status.created.length).toBe(2);
    });
  });

  describe('commit', () => {
    it('should create a commit', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'commit.txt'), 'content');
      await git.add('commit.txt');

      const result = await git.commit({ message: 'Test commit' });

      expect(result).not.toBeNull();
      expect(result?.hash).toBeTruthy();
      expect(result?.message).toBe('Test commit');
    });

    it('should return null for empty commit', async () => {
      if (!isGitAvailable) return;

      const result = await git.commit({ message: 'Empty' });

      expect(result).toBeNull();
    });
  });

  describe('diff', () => {
    it('should show unstaged diff', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'diff.txt'), 'original');
      await git.add('diff.txt');
      await git.commit({ message: 'Add file' });

      await writeFile(join(testDir, 'diff.txt'), 'modified');

      const diff = await git.diff();

      expect(diff).toContain('-original');
      expect(diff).toContain('+modified');
    });

    it('should show staged diff', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'staged-diff.txt'), 'original');
      await git.add('staged-diff.txt');
      await git.commit({ message: 'Add file' });

      await writeFile(join(testDir, 'staged-diff.txt'), 'changed');
      await git.add('staged-diff.txt');

      const diff = await git.stagedDiff();

      expect(diff).toContain('-original');
      expect(diff).toContain('+changed');
    });
  });

  describe('log', () => {
    it('should return commit history', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'log.txt'), 'content');
      await git.add('log.txt');
      await git.commit({ message: 'First commit' });

      const log = await git.log();

      expect(log.all.length).toBe(1);
      expect(log.latest?.message).toContain('First commit');
    });

    it('should limit results', async () => {
      if (!isGitAvailable) return;

      for (let i = 0; i < 5; i++) {
        await writeFile(join(testDir, `file${i}.txt`), `content ${i}`);
        await git.add(`file${i}.txt`);
        await git.commit({ message: `Commit ${i}` });
      }

      const log = await git.log(3);

      expect(log.all.length).toBe(3);
    });
  });

  describe('lastCommit', () => {
    it('should return latest commit info', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'last.txt'), 'content');
      await git.add('last.txt');
      await git.commit({ message: 'Last commit message' });

      const last = await git.lastCommit();

      expect(last).not.toBeNull();
      expect(last?.message).toContain('Last commit message');
      expect(last?.author).toBe('Test User');
    });

    it('should return null for empty repo', async () => {
      if (!isGitAvailable) return;

      // Create new empty repo
      const emptyDir = join(tmpdir(), `empty-repo-${Date.now()}`);
      await mkdir(emptyDir);
      execSync('git init', { cwd: emptyDir, stdio: 'pipe' });

      const emptyGit = new GitManager({ cwd: emptyDir });
      const last = await emptyGit.lastCommit();

      expect(last).toBeNull();

      await rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe('undoLastCommit', () => {
    it('should undo the last commit', async () => {
      if (!isGitAvailable) return;

      // Need at least one commit first (git reset needs a parent)
      await writeFile(join(testDir, 'initial.txt'), 'initial');
      await git.add('initial.txt');
      await git.commit({ message: 'Initial commit' });

      // Now add another commit to undo
      await writeFile(join(testDir, 'undo.txt'), 'content');
      await git.add('undo.txt');
      await git.commit({ message: 'To be undone' });

      const result = await git.undoLastCommit();

      expect(result).toBe(true);

      const status = await git.status();
      expect(status.created).toContain('undo.txt');
    });
  });

  describe('currentBranch', () => {
    it('should return current branch name', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'branch.txt'), 'content');
      await git.add('branch.txt');
      await git.commit({ message: 'Initial commit' });

      const branch = await git.currentBranch();

      expect(branch).toBeTruthy();
      expect(['main', 'master']).toContain(branch);
    });
  });

  describe('trackedFiles', () => {
    it('should return list of tracked files', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'tracked1.txt'), 'a');
      await writeFile(join(testDir, 'tracked2.txt'), 'b');
      await git.addAll();
      await git.commit({ message: 'Add files' });

      const files = await git.trackedFiles();

      expect(files).toContain('tracked1.txt');
      expect(files).toContain('tracked2.txt');
    });
  });

  describe('changedFiles', () => {
    it('should return modified and new files', async () => {
      if (!isGitAvailable) return;

      await writeFile(join(testDir, 'existing.txt'), 'original');
      await git.addAll();
      await git.commit({ message: 'Initial' });

      await writeFile(join(testDir, 'existing.txt'), 'modified');
      await writeFile(join(testDir, 'new.txt'), 'new');

      const changed = await git.changedFiles();

      expect(changed).toContain('existing.txt');
      expect(changed).toContain('new.txt');
    });
  });

  describe('rootDir', () => {
    it('should return repository root', async () => {
      if (!isGitAvailable) return;

      const root = await git.rootDir();

      expect(root).toBe(testDir);
    });
  });
});

describe('generateCommitMessage', () => {
  it('should generate message from diff', async () => {
    const diff = `
diff --git a/src/index.ts b/src/index.ts
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,5 @@
+import { newFeature } from './feature';
+
 export function main() {
-  console.log('old');
+  console.log('new');
 }
`;

    const mockGenerate = async (prompt: string) => {
      expect(prompt).toContain('commit message');
      return 'feat: add new feature and update logging';
    };

    const message = await generateCommitMessage(diff, mockGenerate);

    expect(message).toBe('feat: add new feature and update logging');
  });

  it('should clean up response', async () => {
    const mockGenerate = async () => '"commit: fix bug"';

    const message = await generateCommitMessage('diff', mockGenerate);

    expect(message).toBe('fix bug');
  });

  it('should take only first line', async () => {
    const mockGenerate = async () => 'feat: main change\n\nDetails about the change';

    const message = await generateCommitMessage('diff', mockGenerate);

    expect(message).toBe('feat: main change');
  });
});
