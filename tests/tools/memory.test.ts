/**
 * Tests for memory tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Set up test data directory before importing
const testDataDir = join(tmpdir(), `simple-cli-memory-test-${Date.now()}`);
process.env.SIMPLE_CLI_DATA_DIR = testDataDir;

import { execute, tool } from '../../src/tools/memory.js';

describe('memory tool', () => {
  beforeEach(async () => {
    // Clear the memory before each test
    await execute({ operation: 'clear', namespace: 'all' });
  });

  afterEach(async () => {
    try {
      await rm(testDataDir, { recursive: true, force: true });
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

  describe('set operation', () => {
    it('should store a value', async () => {
      const result = await execute({
        operation: 'set',
        key: 'test-key',
        value: 'test-value',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ key: 'test-key', stored: true });
    });

    it('should require key', async () => {
      const result = await execute({
        operation: 'set',
        value: 'test-value',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Key');
    });

    it('should require value', async () => {
      const result = await execute({
        operation: 'set',
        key: 'test-key',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('value');
    });
  });

  describe('get operation', () => {
    it('should retrieve stored value', async () => {
      await execute({
        operation: 'set',
        key: 'get-test',
        value: 'stored-value',
      });

      const result = await execute({
        operation: 'get',
        key: 'get-test',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).value).toBe('stored-value');
    });

    it('should return null for non-existent key', async () => {
      const result = await execute({
        operation: 'get',
        key: 'non-existent',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it('should require key', async () => {
      const result = await execute({
        operation: 'get',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('delete operation', () => {
    it('should delete stored value', async () => {
      await execute({
        operation: 'set',
        key: 'delete-test',
        value: 'to-delete',
      });

      const deleteResult = await execute({
        operation: 'delete',
        key: 'delete-test',
      });

      expect(deleteResult.success).toBe(true);
      expect((deleteResult.data as any).deleted).toBe(true);

      const getResult = await execute({
        operation: 'get',
        key: 'delete-test',
      });

      expect(getResult.data).toBeNull();
    });

    it('should handle non-existent key', async () => {
      const result = await execute({
        operation: 'delete',
        key: 'non-existent',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).deleted).toBe(false);
    });
  });

  describe('list operation', () => {
    it('should list stored entries', async () => {
      await execute({ operation: 'set', key: 'key1', value: 'value1' });
      await execute({ operation: 'set', key: 'key2', value: 'value2' });

      const result = await execute({ operation: 'list' });

      expect(result.success).toBe(true);
      expect((result.data as any).count).toBe(2);
      expect((result.data as any).entries.length).toBe(2);
    });

    it('should return empty list when no entries', async () => {
      const result = await execute({ operation: 'list' });

      expect(result.success).toBe(true);
      expect((result.data as any).count).toBe(0);
    });

    it('should filter by namespace', async () => {
      await execute({ operation: 'set', key: 'key1', value: 'v1', namespace: 'ns1' });
      await execute({ operation: 'set', key: 'key2', value: 'v2', namespace: 'ns2' });

      const result = await execute({ operation: 'list', namespace: 'ns1' });

      expect((result.data as any).count).toBe(1);
    });
  });

  describe('search operation', () => {
    it('should search by key', async () => {
      await execute({ operation: 'set', key: 'project-alpha', value: 'v1' });
      await execute({ operation: 'set', key: 'project-beta', value: 'v2' });
      await execute({ operation: 'set', key: 'other', value: 'v3' });

      const result = await execute({
        operation: 'search',
        query: 'project',
      });

      expect(result.success).toBe(true);
      expect((result.data as any).count).toBe(2);
    });

    it('should search by value', async () => {
      await execute({ operation: 'set', key: 'key1', value: 'contains searchterm here' });
      await execute({ operation: 'set', key: 'key2', value: 'no match' });

      const result = await execute({
        operation: 'search',
        query: 'searchterm',
      });

      expect((result.data as any).count).toBe(1);
    });

    it('should be case insensitive', async () => {
      await execute({ operation: 'set', key: 'KEY', value: 'VALUE' });

      const result = await execute({
        operation: 'search',
        query: 'key',
      });

      expect((result.data as any).count).toBe(1);
    });

    it('should require query', async () => {
      const result = await execute({ operation: 'search' });

      expect(result.success).toBe(false);
    });
  });

  describe('clear operation', () => {
    it('should clear namespace', async () => {
      await execute({ operation: 'set', key: 'key1', value: 'v1', namespace: 'ns' });
      await execute({ operation: 'set', key: 'key2', value: 'v2', namespace: 'ns' });
      await execute({ operation: 'set', key: 'key3', value: 'v3', namespace: 'other' });

      const result = await execute({ operation: 'clear', namespace: 'ns' });

      expect(result.success).toBe(true);
      expect((result.data as any).cleared).toBe(2);

      const listResult = await execute({ operation: 'list', namespace: 'other' });
      expect((listResult.data as any).count).toBe(1);
    });

    it('should clear all namespaces', async () => {
      await execute({ operation: 'set', key: 'k1', value: 'v1', namespace: 'ns1' });
      await execute({ operation: 'set', key: 'k2', value: 'v2', namespace: 'ns2' });

      const result = await execute({ operation: 'clear', namespace: 'all' });

      expect(result.success).toBe(true);
    });
  });

  describe('namespaces', () => {
    it('should isolate namespaces', async () => {
      await execute({ operation: 'set', key: 'key', value: 'v1', namespace: 'ns1' });
      await execute({ operation: 'set', key: 'key', value: 'v2', namespace: 'ns2' });

      const result1 = await execute({ operation: 'get', key: 'key', namespace: 'ns1' });
      const result2 = await execute({ operation: 'get', key: 'key', namespace: 'ns2' });

      expect((result1.data as any).value).toBe('v1');
      expect((result2.data as any).value).toBe('v2');
    });

    it('should use default namespace', async () => {
      await execute({ operation: 'set', key: 'key', value: 'default-value' });

      const result = await execute({ operation: 'list', namespace: 'default' });

      expect((result.data as any).count).toBe(1);
    });
  });

  describe('timestamps', () => {
    it('should record timestamp on set', async () => {
      const before = Date.now();

      await execute({ operation: 'set', key: 'ts-test', value: 'value' });

      const result = await execute({ operation: 'get', key: 'ts-test' });
      const timestamp = (result.data as any).timestamp;

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(Date.now());
    });
  });
});
