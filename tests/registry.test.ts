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
      expect(tools.has('readFiles')).toBe(true);
      expect(tools.has('writeFiles')).toBe(true);
      expect(tools.has('runCommand')).toBe(true);
    });

    it('should have correct structure for each tool', async () => {
      const tools = await loadTools();

      for (const [name, tool] of tools) {
        expect(tool.name).toBe(name);
        expect(tool.description).toBeDefined();
        expect(typeof tool.description).toBe('string');
        expect(tool.permission).toBeDefined();
        expect(['read', 'write', 'execute']).toContain(tool.permission);
        expect(tool.schema).toBeDefined();
        expect(tool.execute).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });

    it('should have correct permissions for tools', async () => {
      const tools = await loadTools();

      expect(tools.get('readFiles')?.permission).toBe('read');
      expect(tools.get('writeFiles')?.permission).toBe('write');
      expect(tools.get('runCommand')?.permission).toBe('execute');
    });
  });

  describe('getToolDefinitions', () => {
    it('should format tool definitions for LLM prompt', async () => {
      const tools = await loadTools();
      const definitions = getToolDefinitions(tools);

      expect(definitions).toContain('readFiles');
      expect(definitions).toContain('writeFiles');
      expect(definitions).toContain('runCommand');
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

    it('should execute readFiles tool via registry', async () => {
      const tools = await loadTools();
      const readFiles = tools.get('readFiles');
      
      const filePath = join(testDir, 'test.txt');
      await writeFile(filePath, 'test content');

      const result = await readFiles!.execute({ paths: [filePath] });

      expect(Array.isArray(result)).toBe(true);
      expect((result as any[])[0].content).toBe('test content');
    });

    it('should execute writeFiles tool via registry', async () => {
      const tools = await loadTools();
      const writeFiles = tools.get('writeFiles');
      
      const filePath = join(testDir, 'new.txt');

      const result = await writeFiles!.execute({
        files: [{ path: filePath, content: 'new content' }]
      });

      expect((result as any[])[0].success).toBe(true);
    });

    it('should execute runCommand tool via registry', async () => {
      const tools = await loadTools();
      const runCommand = tools.get('runCommand');

      const result = await runCommand!.execute({ command: 'echo hello' });

      expect((result as any).exitCode).toBe(0);
      expect((result as any).stdout).toContain('hello');
    });
  });

  describe('tool schema validation', () => {
    it('should validate readFiles input', async () => {
      const tools = await loadTools();
      const readFiles = tools.get('readFiles');

      // Valid input
      expect(() => readFiles!.schema.parse({ paths: ['file.txt'] })).not.toThrow();

      // Invalid input
      expect(() => readFiles!.schema.parse({})).toThrow();
    });

    it('should validate writeFiles input', async () => {
      const tools = await loadTools();
      const writeFiles = tools.get('writeFiles');

      // Valid input
      expect(() => writeFiles!.schema.parse({
        files: [{ path: 'file.txt', content: 'test' }]
      })).not.toThrow();

      // Invalid input
      expect(() => writeFiles!.schema.parse({})).toThrow();
    });

    it('should validate runCommand input', async () => {
      const tools = await loadTools();
      const runCommand = tools.get('runCommand');

      // Valid input
      expect(() => runCommand!.schema.parse({ command: 'echo test' })).not.toThrow();

      // Invalid input
      expect(() => runCommand!.schema.parse({})).toThrow();
    });
  });
});
