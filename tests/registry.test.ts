/**
 * Tests for tool registry module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadTools, getToolDefinitions, type Tool } from '../src/registry.js';

describe('registry', () => {
  describe('loadTools', () => {
    it('should load all built-in tools', async () => {
      const tools = await loadTools();

      expect(tools.size).toBeGreaterThanOrEqual(3);
      expect(tools.has('read_files')).toBe(true);
      expect(tools.has('write_files')).toBe(true);
      expect(tools.has('run_command')).toBe(true);
    });

    it('should have correct structure for each tool', async () => {
      const tools = await loadTools();

      for (const [name, tool] of tools) {
        expect(tool.name).toBe(name);
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.permission).toBeDefined();
        expect(['read', 'write', 'execute']).toContain(tool.permission);
        expect(tool.inputSchema).toBeDefined();
        expect(tool.execute).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });

    it('should have correct permissions for tools', async () => {
      const tools = await loadTools();

      expect(tools.get('read_files')?.permission).toBe('read');
      expect(tools.get('write_files')?.permission).toBe('write');
      expect(tools.get('run_command')?.permission).toBe('execute');
    });
  });

  describe('getToolDefinitions', () => {
    it('should format tool definitions for LLM prompt', async () => {
      const tools = await loadTools();
      const definitions = getToolDefinitions(tools);

      expect(definitions).toContain('read_files');
      expect(definitions).toContain('write_files');
      expect(definitions).toContain('run_command');
      expect(definitions).toContain('Permission:');
    });

    it('should include descriptions', async () => {
      const tools = await loadTools();
      const definitions = getToolDefinitions(tools);

      // Should contain tool descriptions
      expect(definitions).toContain('Read');
      expect(definitions).toContain('Write');
      expect(definitions).toContain('Execute');
    });
  });

  describe('tool execution', () => {
    let testDir: string;

    beforeEach(async () => {
      testDir = join(tmpdir(), `simple-cli-registry-${Date.now()}`);
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should execute read_files tool via registry', async () => {
      const tools = await loadTools();
      const readFiles = tools.get('read_files');

      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'test content');

      const result = await readFiles!.execute({ paths: [filePath] });

      expect(Array.isArray(result)).toBe(true);
      expect((result as any[])[0].content).toBe('test content');
    });

    it('should execute write_files tool via registry', async () => {
      const tools = await loadTools();
      const writeFiles = tools.get('write_files');

      const filePath = join(testDir, 'new.txt');

      const result = await writeFiles!.execute({
        files: [{ path: filePath, content: 'new content' }]
      });

      expect((result as any[])[0].success).toBe(true);
    });

    it('should execute run_command tool via registry', async () => {
      const tools = await loadTools();
      const runCommand = tools.get('run_command');

      const result = await runCommand!.execute({ command: 'echo hello' });

      expect((result as any).exitCode).toBe(0);
      expect((result as any).stdout).toContain('hello');
    });
  });

  describe('tool schema validation', () => {
    it('should validate read_files input', async () => {
      const tools = await loadTools();
      const readFiles = tools.get('read_files');

      // Valid input
      expect(() => readFiles!.inputSchema.parse({ paths: ['file.txt'] })).not.toThrow();

      // Invalid input
      expect(() => readFiles!.inputSchema.parse({})).toThrow();
    });

    it('should validate write_files input', async () => {
      const tools = await loadTools();
      const writeFiles = tools.get('write_files');

      // Valid input
      expect(() => writeFiles!.inputSchema.parse({
        files: [{ path: 'file.txt', content: 'test' }]
      })).not.toThrow();

      // Invalid input
      expect(() => writeFiles!.inputSchema.parse({})).toThrow();
    });

    it('should validate run_command input', async () => {
      const tools = await loadTools();
      const runCommand = tools.get('run_command');

      // Valid input
      expect(() => runCommand!.inputSchema.parse({ command: 'echo test' })).not.toThrow();

      // Invalid input
      expect(() => runCommand!.inputSchema.parse({})).toThrow();
    });
  });
});
