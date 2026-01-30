/**
 * MCP Client Manager - Manages multiple MCP server connections
 * Supports Composio, custom MCP servers, and dynamic tool discovery
 * Based on GeminiCLI's mcp-client.ts patterns
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// MCP Server Configuration Schema
export const MCPServerConfigSchema = z.object({
  name: z.string(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  url: z.string().optional(),
  type: z.enum(['stdio', 'sse', 'http']).optional(),
  timeout: z.number().optional(),
  trust: z.enum(['full', 'partial', 'none']).optional(),
  enabled: z.boolean().optional().default(true),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

// MCP Tool Definition
export interface MCPTool {
  name: string;
  description: string;
  serverName: string;
  inputSchema: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

// MCP Resource Definition
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  serverName: string;
}

// MCP Prompt Definition
export interface MCPPrompt {
  name: string;
  description?: string;
  serverName: string;
  arguments?: Array<{ name: string; description?: string; required?: boolean }>;
  invoke: (params: Record<string, unknown>) => Promise<{ messages: Array<{ role: string; content: string }> }>;
}

// Server Status
export enum MCPServerStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error',
}

// Server State
interface ServerState {
  client: Client | null;
  transport: Transport | null;
  status: MCPServerStatus;
  config: MCPServerConfig;
  tools: MCPTool[];
  resources: MCPResource[];
  prompts: MCPPrompt[];
  error?: string;
}

/**
 * MCP Client Manager
 * Manages connections to multiple MCP servers and aggregates their tools
 */
export class MCPManager {
  private servers: Map<string, ServerState> = new Map();
  private onStatusChange?: (serverName: string, status: MCPServerStatus) => void;

  constructor(options?: { onStatusChange?: (serverName: string, status: MCPServerStatus) => void }) {
    this.onStatusChange = options?.onStatusChange;
  }

  /**
   * Load MCP configuration from file
   */
  async loadConfig(configPath?: string): Promise<MCPServerConfig[]> {
    const paths = [
      configPath,
      join(process.cwd(), 'mcp.json'),
      join(process.cwd(), '.mcp.json'),
      join(process.env.HOME || '', '.config', 'simplecli', 'mcp.json'),
    ].filter(Boolean) as string[];

    for (const path of paths) {
      if (existsSync(path)) {
        try {
          const content = readFileSync(path, 'utf-8');
          const config = JSON.parse(content);

          // Handle both { servers: [...] } and { mcpServers: {...} } formats
          if (config.servers) {
            return config.servers.filter((s: MCPServerConfig) => s.enabled !== false);
          }
          if (config.mcpServers) {
            return Object.entries(config.mcpServers)
              .map(([name, cfg]) => ({ name, ...(cfg as object) } as MCPServerConfig))
              .filter((s: MCPServerConfig) => s.enabled !== false);
          }
          return [];
        } catch (e) {
          console.error(`Failed to parse MCP config at ${path}:`, e);
        }
      }
    }

    return [];
  }

  /**
   * Connect to an MCP server
   */
  async connect(config: MCPServerConfig): Promise<void> {
    const serverName = config.name;

    if (this.servers.has(serverName)) {
      await this.disconnect(serverName);
    }

    const state: ServerState = {
      client: null,
      transport: null,
      status: MCPServerStatus.CONNECTING,
      config,
      tools: [],
      resources: [],
      prompts: [],
    };

    this.servers.set(serverName, state);
    this.updateStatus(serverName, MCPServerStatus.CONNECTING);

    try {
      const client = new Client(
        { name: 'simplecli', version: '0.2.1' },
        { capabilities: {} }
      );

      let transport: Transport;

      if (config.command) {
        // Stdio transport
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
        });
      } else if (config.url) {
        // For URL-based transports, we'd need additional SDK imports
        // For now, throw an error suggesting stdio
        throw new Error('URL-based MCP transports require additional configuration. Use stdio transport with command.');
      } else {
        throw new Error(`Invalid MCP server config for ${serverName}: missing command or url`);
      }

      await client.connect(transport);

      state.client = client;
      state.transport = transport;
      state.status = MCPServerStatus.CONNECTED;

      // Discover tools, resources, and prompts
      await this.discover(serverName);

      this.updateStatus(serverName, MCPServerStatus.CONNECTED);
      console.log(`✓ Connected to MCP server: ${serverName}`);

    } catch (error) {
      state.status = MCPServerStatus.ERROR;
      state.error = error instanceof Error ? error.message : String(error);
      this.updateStatus(serverName, MCPServerStatus.ERROR);
      console.error(`✗ Failed to connect to MCP server ${serverName}:`, state.error);
    }
  }

  /**
   * Connect to all configured servers
   */
  async connectAll(configs?: MCPServerConfig[]): Promise<void> {
    const serverConfigs = configs || await this.loadConfig();

    await Promise.all(
      serverConfigs.map(config => this.connect(config).catch(e => {
        console.error(`Failed to connect to ${config.name}:`, e);
      }))
    );
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(serverName: string): Promise<void> {
    const state = this.servers.get(serverName);
    if (!state) return;

    try {
      if (state.transport) {
        await state.transport.close();
      }
      if (state.client) {
        await state.client.close();
      }
    } catch (e) {
      // Ignore close errors
    }

    this.servers.delete(serverName);
    this.updateStatus(serverName, MCPServerStatus.DISCONNECTED);
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    await Promise.all(
      Array.from(this.servers.keys()).map(name => this.disconnect(name))
    );
  }

  /**
   * Discover tools, resources, and prompts from a server
   */
  private async discover(serverName: string): Promise<void> {
    const state = this.servers.get(serverName);
    if (!state?.client) return;

    const client = state.client;

    // Discover tools
    try {
      const toolsResult = await client.listTools();
      state.tools = toolsResult.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        serverName,
        inputSchema: tool.inputSchema || {},
        execute: async (args: Record<string, unknown>) => {
          const result = await client.callTool({ name: tool.name, arguments: args });
          return result;
        },
      }));
    } catch {
      // Server may not support tools
    }

    // Discover resources
    try {
      const resourcesResult = await client.listResources();
      state.resources = resourcesResult.resources.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
        serverName,
      }));
    } catch {
      // Server may not support resources
    }

    // Discover prompts
    try {
      const promptsResult = await client.listPrompts();
      state.prompts = promptsResult.prompts.map(prompt => ({
        name: prompt.name,
        description: prompt.description,
        serverName,
        arguments: prompt.arguments,
        invoke: async (params: Record<string, unknown>) => {
          const stringParams: Record<string, string> = {};
          for (const [k, v] of Object.entries(params)) {
            stringParams[k] = String(v);
          }
          const result = await client.getPrompt({ name: prompt.name, arguments: stringParams });
          return {
            messages: result.messages.map(m => ({
              role: m.role,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            })),
          };
        },
      }));
    } catch {
      // Server may not support prompts
    }
  }

  /**
   * Get all discovered tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const state of this.servers.values()) {
      if (state.status === MCPServerStatus.CONNECTED) {
        tools.push(...state.tools);
      }
    }
    return tools;
  }

  /**
   * Get all discovered resources from all connected servers
   */
  getAllResources(): MCPResource[] {
    const resources: MCPResource[] = [];
    for (const state of this.servers.values()) {
      if (state.status === MCPServerStatus.CONNECTED) {
        resources.push(...state.resources);
      }
    }
    return resources;
  }

  /**
   * Get all discovered prompts from all connected servers
   */
  getAllPrompts(): MCPPrompt[] {
    const prompts: MCPPrompt[] = [];
    for (const state of this.servers.values()) {
      if (state.status === MCPServerStatus.CONNECTED) {
        prompts.push(...state.prompts);
      }
    }
    return prompts;
  }

  /**
   * Get a specific tool by name
   */
  getTool(name: string): MCPTool | undefined {
    return this.getAllTools().find(t => t.name === name);
  }

  /**
   * Execute an MCP tool
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`MCP tool not found: ${name}`);
    }
    return tool.execute(args);
  }

  /**
   * Read an MCP resource
   */
  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; text?: string; blob?: string }> }> {
    // Find which server has this resource
    for (const state of this.servers.values()) {
      if (state.status !== MCPServerStatus.CONNECTED || !state.client) continue;

      const resource = state.resources.find(r => r.uri === uri);
      if (resource) {
        const result = await state.client.readResource({ uri });
        return result;
      }
    }
    throw new Error(`Resource not found: ${uri}`);
  }

  /**
   * Invoke an MCP prompt
   */
  async invokePrompt(name: string, params: Record<string, unknown>): Promise<{ messages: Array<{ role: string; content: string }> }> {
    const prompt = this.getAllPrompts().find(p => p.name === name);
    if (!prompt) {
      throw new Error(`MCP prompt not found: ${name}`);
    }
    return prompt.invoke(params);
  }

  /**
   * Get server status
   */
  getServerStatus(serverName: string): MCPServerStatus {
    return this.servers.get(serverName)?.status || MCPServerStatus.DISCONNECTED;
  }

  /**
   * Get all server statuses
   */
  getAllServerStatuses(): Map<string, MCPServerStatus> {
    const statuses = new Map<string, MCPServerStatus>();
    for (const [name, state] of this.servers) {
      statuses.set(name, state.status);
    }
    return statuses;
  }

  private updateStatus(serverName: string, status: MCPServerStatus): void {
    this.onStatusChange?.(serverName, status);
  }
}

/**
 * Create Composio MCP configuration
 * Composio provides pre-built integrations for 250+ tools
 */
export function createComposioConfig(apiKey?: string): MCPServerConfig {
  return {
    name: 'composio',
    command: 'npx',
    args: ['-y', 'composio-core', 'mcp'],
    env: apiKey ? { COMPOSIO_API_KEY: apiKey } : {},
    trust: 'full',
    enabled: true,
  };
}

/**
 * Create filesystem MCP configuration
 */
export function createFilesystemConfig(allowedPaths: string[]): MCPServerConfig {
  return {
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', ...allowedPaths],
    trust: 'full',
    enabled: true,
  };
}

/**
 * Create GitHub MCP configuration
 */
export function createGitHubConfig(token?: string): MCPServerConfig {
  return {
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: token ? { GITHUB_PERSONAL_ACCESS_TOKEN: token } : {},
    trust: 'full',
    enabled: true,
  };
}

/**
 * Create memory/context MCP configuration
 */
export function createMemoryConfig(): MCPServerConfig {
  return {
    name: 'memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    trust: 'full',
    enabled: true,
  };
}

/**
 * Create Brave Search MCP configuration
 */
export function createBraveSearchConfig(apiKey?: string): MCPServerConfig {
  return {
    name: 'brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: apiKey ? { BRAVE_API_KEY: apiKey } : {},
    trust: 'full',
    enabled: true,
  };
}

// Singleton instance
let mcpManager: MCPManager | null = null;

/**
 * Get or create the global MCP manager instance
 */
export function getMCPManager(): MCPManager {
  if (!mcpManager) {
    mcpManager = new MCPManager();
  }
  return mcpManager;
}
