/**
 * Tests for memory tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Override CWD for tests to isolate project memory
const originalCwd = process.cwd();
let testDataDir: string;

// Since the tool uses process.cwd(), we can't easily mock it without impacting everything.
// But we can rely on the fact that it writes to .simple/ inside cwd.
// We will change cwd for the test.

import { execute, tool } from '../../src/tools/memory.js';

describe('memory tool', () => {
  beforeEach(async () => {
    // Create unique temp dir for each test
    testDataDir = join(tmpdir(), `simple-cli-memory-test-${Date.now()}-${Math.random()}`);
    await import('fs/promises').then(fs => fs.mkdir(testDataDir, { recursive: true }));
    process.chdir(testDataDir);
  });

  afterEach(async () => {
    // Cleanup
    process.chdir(originalCwd);
    try {
      if (testDataDir) {
        await rm(testDataDir, { recursive: true, force: true });
      }
    } catch {}
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('memory');
    });

    it('should have correct permission', () => {
      expect(tool.permission).toBe('write');
    });
  });

  describe('kv store operations', () => {
    it('should store a value', async () => {
      const result = await execute({
        action: 'kv_set',
        key: 'test-key',
        content: 'test-value',
      });

      expect(result).toContain('KV set: test-key = test-value');

      const getResult = await execute({
          action: 'kv_get',
          key: 'test-key'
      });
      expect(getResult).toBe('Value: test-value');
    });

    it('should require key for set', async () => {
      await expect(execute({
        action: 'kv_set',
        content: 'test-value',
      })).rejects.toThrow(); // Zod or manual check
    });

    it('should list keys', async () => {
      await execute({ action: 'kv_set', key: 'k1', content: 'v1' });
      await execute({ action: 'kv_set', key: 'k2', content: 'v2' });

      const result = await execute({ action: 'kv_list' });
      expect(result).toContain('k1');
      expect(result).toContain('k2');
    });

    it('should delete key', async () => {
        await execute({ action: 'kv_set', key: 'k1', content: 'v1' });
        const res = await execute({ action: 'kv_delete', key: 'k1' });
        expect(res).toContain('Deleted key: k1');

        const check = await execute({ action: 'kv_get', key: 'k1' });
        expect(check).toBe('Key not found');
    });
  });

  describe('facts operations', () => {
    it('should learn project fact', async () => {
        const res = await execute({ action: 'learn_fact', content: 'Project uses TypeScript', category: 'project' });
        expect(res).toContain('Learned project fact');

        const recall = await execute({ action: 'recall', content: 'TypeScript' });
        expect(recall).toContain('[Project] Project uses TypeScript');
    });

    it('should forget fact', async () => {
        await execute({ action: 'learn_fact', content: 'To be forgotten', category: 'project' });
        const res = await execute({ action: 'forget_fact', content: 'forgotten' });
        expect(res).toContain('Forgot facts containing "forgotten"');

        const recall = await execute({ action: 'recall', content: 'forgotten' });
        expect(recall).toContain('No memories found');
    });
  });

  describe('patterns operations', () => {
      it('should add and search patterns', async () => {
          await execute({ action: 'add_pattern', content: 'Use Zod for validation' });
          const res = await execute({ action: 'search_patterns', content: 'Zod' });
          expect(res).toContain('Use Zod for validation');
      });
  });

  describe('mission operations', () => {
      it('should set mission goal', async () => {
          const res = await execute({ action: 'mission_set', content: 'Refactor code', status: 'planning' });
          expect(res).toContain('Mission goal set: "Refactor code"');
      });

      it('should update mission', async () => {
          await execute({ action: 'mission_set', content: 'Goal' });
          const res = await execute({ action: 'mission_update', status: 'executing', content: 'Started work' });
          expect(res).toContain('Mission updated. Status: executing');
      });
  });
});
