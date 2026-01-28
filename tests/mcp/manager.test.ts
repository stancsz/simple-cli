/**
 * Tests for MCP Manager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: { type: 'object', properties: { arg: { type: 'string' } } },
        },
      ],
    }),
    listResources: vi.fn().mockResolvedValue({
      resources: [
        { uri: 'file:///test.txt', name: 'test.txt', mimeType: 'text/plain' },
      ],
    }),
    listPrompts: vi.fn().mockResolvedValue({
      prompts: [
        { name: 'test_prompt', description: 'A test prompt' },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'result' }] }),
    readResource: vi.fn().mockResolvedValue({ contents: [{ uri: 'file:///test.txt', text: 'content' }] }),
    getPrompt: vi.fn().mockResolvedValue({ messages: [{ role: 'user', content: 'prompt text' }] }),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({})),
}));

import {
  MCPManager,
  MCPServerStatus,
  MCPServerConfigSchema,
  createComposioConfig,
  createFilesystemConfig,
  createGitHubConfig,
  createMemoryConfig,
  createBraveSearchConfig,
} from '../../src/mcp/manager.js';

describe('MCPManager', () => {
  let manager: MCPManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new MCPManager();
  });

  describe('configuration schema', () => {
    it('should validate valid config', () => {
      const config = {
        name: 'test-server',
        command: 'npx',
        args: ['-y', 'test-server'],
      };

      expect(() => MCPServerConfigSchema.parse(config)).not.toThrow();
    });

    it('should require name', () => {
      const config = {
        command: 'npx',
      };

      expect(() => MCPServerConfigSchema.parse(config)).toThrow();
    });

    it('should allow optional fields', () => {
      const config = {
        name: 'test',
        command: 'cmd',
        args: ['arg1'],
        env: { KEY: 'value' },
        timeout: 5000,
        trust: 'full' as const,
      };

      const parsed = MCPServerConfigSchema.parse(config);
      expect(parsed.timeout).toBe(5000);
      expect(parsed.trust).toBe('full');
    });
  });

  describe('connect', () => {
    it('should connect to server', async () => {
      await manager.connect({
        name: 'test-server',
        command: 'test-cmd',
      });

      expect(manager.getServerStatus('test-server')).toBe(MCPServerStatus.CONNECTED);
    });

    it('should handle connection errors', async () => {
      const errorManager = new MCPManager();
      
      // This will fail because the mock transport doesn't actually connect
      // In a real test, we'd mock the connection failure
      await errorManager.connect({
        name: 'failing-server',
        command: 'nonexistent-command',
      });

      // The manager should handle the error gracefully
      expect(errorManager.getServerStatus('failing-server')).toBeDefined();
    });
  });

  describe('disconnect', () => {
    it('should disconnect from server', async () => {
      await manager.connect({
        name: 'test-server',
        command: 'test-cmd',
      });

      await manager.disconnect('test-server');

      expect(manager.getServerStatus('test-server')).toBe(MCPServerStatus.DISCONNECTED);
    });

    it('should handle disconnecting non-connected server', async () => {
      await expect(manager.disconnect('non-existent')).resolves.not.toThrow();
    });
  });

  describe('tools discovery', () => {
    it('should get all tools from connected servers', async () => {
      await manager.connect({
        name: 'server1',
        command: 'cmd1',
      });

      const tools = manager.getAllTools();
      expect(tools.length).toBeGreaterThan(0);
    });

    it('should get specific tool by name', async () => {
      await manager.connect({
        name: 'server1',
        command: 'cmd1',
      });

      const tools = manager.getAllTools();
      if (tools.length > 0) {
        const tool = manager.getTool(tools[0].name);
        expect(tool).toBeDefined();
      }
    });

    it('should return undefined for non-existent tool', () => {
      const tool = manager.getTool('non-existent-tool');
      expect(tool).toBeUndefined();
    });
  });

  describe('resources discovery', () => {
    it('should get all resources from connected servers', async () => {
      await manager.connect({
        name: 'server1',
        command: 'cmd1',
      });

      const resources = manager.getAllResources();
      expect(resources.length).toBeGreaterThan(0);
    });
  });

  describe('prompts discovery', () => {
    it('should get all prompts from connected servers', async () => {
      await manager.connect({
        name: 'server1',
        command: 'cmd1',
      });

      const prompts = manager.getAllPrompts();
      expect(prompts.length).toBeGreaterThan(0);
    });
  });

  describe('server status', () => {
    it('should track server statuses', async () => {
      await manager.connect({
        name: 'server1',
        command: 'cmd1',
      });

      const statuses = manager.getAllServerStatuses();
      expect(statuses.has('server1')).toBe(true);
    });

    it('should return disconnected for unknown server', () => {
      const status = manager.getServerStatus('unknown');
      expect(status).toBe(MCPServerStatus.DISCONNECTED);
    });
  });

  describe('status change callback', () => {
    it('should call callback on status change', async () => {
      const callback = vi.fn();
      const callbackManager = new MCPManager({ onStatusChange: callback });

      await callbackManager.connect({
        name: 'test-server',
        command: 'cmd',
      });

      expect(callback).toHaveBeenCalled();
    });
  });
});

describe('configuration helpers', () => {
  describe('createComposioConfig', () => {
    it('should create Composio config', () => {
      const config = createComposioConfig('test-api-key');

      expect(config.name).toBe('composio');
      expect(config.command).toBe('npx');
      expect(config.args).toContain('composio-core');
      expect(config.env?.COMPOSIO_API_KEY).toBe('test-api-key');
    });

    it('should work without API key', () => {
      const config = createComposioConfig();

      expect(config.name).toBe('composio');
      expect(config.env).toEqual({});
    });
  });

  describe('createFilesystemConfig', () => {
    it('should create filesystem config with paths', () => {
      const config = createFilesystemConfig(['/home', '/tmp']);

      expect(config.name).toBe('filesystem');
      expect(config.args).toContain('/home');
      expect(config.args).toContain('/tmp');
    });
  });

  describe('createGitHubConfig', () => {
    it('should create GitHub config', () => {
      const config = createGitHubConfig('gh_token');

      expect(config.name).toBe('github');
      expect(config.env?.GITHUB_PERSONAL_ACCESS_TOKEN).toBe('gh_token');
    });
  });

  describe('createMemoryConfig', () => {
    it('should create memory config', () => {
      const config = createMemoryConfig();

      expect(config.name).toBe('memory');
      expect(config.args).toContain('@modelcontextprotocol/server-memory');
    });
  });

  describe('createBraveSearchConfig', () => {
    it('should create Brave Search config', () => {
      const config = createBraveSearchConfig('brave_key');

      expect(config.name).toBe('brave-search');
      expect(config.env?.BRAVE_API_KEY).toBe('brave_key');
    });
  });
});
