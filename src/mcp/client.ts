/**
 * MCP Client: External tool integration via Model Context Protocol
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';

export interface MCPServer {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
}

interface MCPClientConnection {
  client: Client;
  transport: StdioClientTransport;
}

// Active MCP connections
const connections = new Map<string, MCPClientConnection>();

// Connect to an MCP server
export const connectMCPServer = async (server: MCPServer): Promise<Client> => {
  if (connections.has(server.name)) {
    return connections.get(server.name)!.client;
  }
  
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args || [],
    env: { ...process.env, ...server.env } as Record<string, string>
  });
  
  const client = new Client({
    name: 'simple-cli',
    version: '0.1.0'
  }, {
    capabilities: {}
  });
  
  await client.connect(transport);
  
  connections.set(server.name, { client, transport });
  console.log(`  ✓ Connected to MCP server: ${server.name}`);
  
  return client;
};

// List tools from an MCP server
export const listMCPTools = async (serverName: string): Promise<MCPTool[]> => {
  const connection = connections.get(serverName);
  if (!connection) {
    throw new Error(`MCP server "${serverName}" not connected`);
  }
  
  const result = await connection.client.listTools();
  
  return result.tools.map(tool => ({
    name: tool.name,
    description: tool.description || '',
    inputSchema: z.object({}) // Simplified - would parse JSON schema in production
  }));
};

// Call an MCP tool
export const callMCPTool = async (
  serverName: string, 
  toolName: string, 
  args: Record<string, unknown>
): Promise<unknown> => {
  const connection = connections.get(serverName);
  if (!connection) {
    throw new Error(`MCP server "${serverName}" not connected`);
  }
  
  const result = await connection.client.callTool({
    name: toolName,
    arguments: args
  });
  
  return result.content;
};

// Disconnect from an MCP server
export const disconnectMCPServer = async (serverName: string): Promise<void> => {
  const connection = connections.get(serverName);
  if (connection) {
    await connection.client.close();
    connections.delete(serverName);
    console.log(`  ✓ Disconnected from MCP server: ${serverName}`);
  }
};

// Disconnect from all MCP servers
export const disconnectAllMCPServers = async (): Promise<void> => {
  for (const [name] of connections) {
    await disconnectMCPServer(name);
  }
};

// Load MCP servers from configuration
export const loadMCPConfig = async (configPath: string = './mcp.json'): Promise<MCPServer[]> => {
  try {
    const { readFile } = await import('fs/promises');
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content) as { servers?: MCPServer[] };
    return config.servers || [];
  } catch {
    return [];
  }
};
