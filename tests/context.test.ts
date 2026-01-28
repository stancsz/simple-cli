/**
 * Tests for context manager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the loadAllTools function
vi.mock('../src/registry.js', async () => {
  const actual = await vi.importActual('../src/registry.js');
  return {
    ...actual,
    loadAllTools: vi.fn().mockResolvedValue(new Map([
      ['readFiles', { name: 'readFiles', description: 'Read files', permission: 'read', inputSchema: {}, execute: vi.fn() }],
      ['writeFiles', { name: 'writeFiles', description: 'Write files', permission: 'write', inputSchema: {}, execute: vi.fn() }],
    ])),
  };
});

import { ContextManager, getContextManager } from '../src/context.js';
import { builtinSkills } from '../src/skills.js';

describe('ContextManager', () => {
  let testDir: string;
  let manager: ContextManager;

  beforeEach(async () => {
    testDir = join(tmpdir(), `simple-cli-context-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    manager = new ContextManager(testDir);
    await manager.initialize();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('file management', () => {
    it('should add existing file', async () => {
      await writeFile(join(testDir, 'test.txt'), 'content');
      
      const added = manager.addFile('test.txt');
      
      expect(added).toBe(true);
      expect(manager.getFiles().active).toContain('test.txt');
    });

    it('should not add non-existent file', () => {
      const added = manager.addFile('nonexistent.txt');
      
      expect(added).toBe(false);
    });

    it('should add file as read-only', async () => {
      await writeFile(join(testDir, 'readonly.txt'), 'content');
      
      manager.addFile('readonly.txt', true);
      
      expect(manager.getFiles().readOnly).toContain('readonly.txt');
      expect(manager.getFiles().active).not.toContain('readonly.txt');
    });

    it('should remove file from context', async () => {
      await writeFile(join(testDir, 'remove.txt'), 'content');
      manager.addFile('remove.txt');
      
      const removed = manager.removeFile('remove.txt');
      
      expect(removed).toBe(true);
      expect(manager.getFiles().active).not.toContain('remove.txt');
    });

    it('should return false for removing non-added file', () => {
      const removed = manager.removeFile('never-added.txt');
      
      expect(removed).toBe(false);
    });
  });

  describe('file contents', () => {
    it('should read file contents', async () => {
      await writeFile(join(testDir, 'content.txt'), 'file content here');
      manager.addFile('content.txt');
      
      const contents = await manager.getFileContents();
      
      expect(contents.get('content.txt')).toBe('file content here');
    });

    it('should read multiple files', async () => {
      await writeFile(join(testDir, 'a.txt'), 'content a');
      await writeFile(join(testDir, 'b.txt'), 'content b');
      manager.addFile('a.txt');
      manager.addFile('b.txt');
      
      const contents = await manager.getFileContents();
      
      expect(contents.size).toBe(2);
    });

    it('should include read-only files', async () => {
      await writeFile(join(testDir, 'ro.txt'), 'read only');
      manager.addFile('ro.txt', true);
      
      const contents = await manager.getFileContents();
      
      expect(contents.get('ro.txt')).toBe('read only');
    });
  });

  describe('message history', () => {
    it('should add messages', () => {
      manager.addMessage('user', 'Hello');
      manager.addMessage('assistant', 'Hi there');
      
      const history = manager.getHistory();
      
      expect(history.length).toBe(2);
      expect(history[0].content).toBe('Hello');
    });

    it('should clear history', () => {
      manager.addMessage('user', 'Test');
      manager.clearHistory();
      
      expect(manager.getHistory().length).toBe(0);
    });

    it('should include timestamps', () => {
      manager.addMessage('user', 'Timed');
      
      const history = manager.getHistory();
      
      expect(history[0].timestamp).toBeDefined();
      expect(history[0].timestamp).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('skills', () => {
    it('should get current skill', () => {
      const skill = manager.getSkill();
      
      expect(skill).toBeDefined();
      expect(skill.name).toBeTruthy();
    });

    it('should set skill', () => {
      manager.setSkill(builtinSkills.architect);
      
      expect(manager.getSkill().name).toBe('architect');
    });
  });

  describe('system prompt', () => {
    it('should build system prompt', async () => {
      const prompt = await manager.buildSystemPrompt();
      
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should include tool definitions', async () => {
      const prompt = await manager.buildSystemPrompt();
      
      expect(prompt).toContain('Tools');
    });

    it('should include active files', async () => {
      await writeFile(join(testDir, 'active.txt'), 'content');
      manager.addFile('active.txt');
      
      const prompt = await manager.buildSystemPrompt();
      
      expect(prompt).toContain('active.txt');
    });
  });

  describe('messages for LLM', () => {
    it('should build messages array', async () => {
      const messages = await manager.buildMessages('User query');
      
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].role).toBe('system');
      expect(messages[messages.length - 1].content).toBe('User query');
    });

    it('should include file contents', async () => {
      await writeFile(join(testDir, 'included.txt'), 'file data');
      manager.addFile('included.txt');
      
      const messages = await manager.buildMessages('Query');
      const hasFileContent = messages.some(m => m.content.includes('file data'));
      
      expect(hasFileContent).toBe(true);
    });

    it('should include history', async () => {
      manager.addMessage('user', 'Previous message');
      manager.addMessage('assistant', 'Previous response');
      
      const messages = await manager.buildMessages('New query');
      
      expect(messages.some(m => m.content === 'Previous message')).toBe(true);
      expect(messages.some(m => m.content === 'Previous response')).toBe(true);
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens', async () => {
      manager.addMessage('user', 'Test message with some content');
      
      const tokens = await manager.estimateTokenCount();
      
      expect(tokens).toBeGreaterThan(0);
    });

    it('should include file contents in estimate', async () => {
      await writeFile(join(testDir, 'large.txt'), 'x'.repeat(1000));
      manager.addFile('large.txt');
      
      const tokens = await manager.estimateTokenCount();
      
      expect(tokens).toBeGreaterThan(250); // ~1000/4
    });
  });

  describe('state management', () => {
    it('should get current state', async () => {
      await writeFile(join(testDir, 'state.txt'), 'content');
      manager.addFile('state.txt');
      manager.addMessage('user', 'State test');
      
      const state = manager.getState();
      
      expect(state.cwd).toBe(testDir);
      expect(state.activeFiles.size).toBe(1);
      expect(state.history.length).toBe(1);
    });

    it('should restore state', async () => {
      const newState = {
        history: [{ role: 'user' as const, content: 'Restored' }],
      };
      
      manager.restoreState(newState);
      
      expect(manager.getHistory()[0].content).toBe('Restored');
    });
  });

  describe('getContextManager singleton', () => {
    it('should return same instance', () => {
      const manager1 = getContextManager();
      const manager2 = getContextManager();
      
      expect(manager1).toBe(manager2);
    });
  });
});
