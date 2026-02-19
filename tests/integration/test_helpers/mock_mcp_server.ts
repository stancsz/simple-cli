
import { vi } from 'vitest';

// Registry to store tool handlers and definitions across all mock servers
export const mockToolHandlers = new Map<string, Function>();
export const mockServerTools = new Map<string, any[]>(); // serverName -> tools

export function resetMocks() {
    mockToolHandlers.clear();
    mockServerTools.clear();
}

// Mock implementation of McpServer from @modelcontextprotocol/sdk
export class MockMcpServer {
  private name: string;

  constructor(config: { name: string; version?: string }) {
    this.name = config.name;
    // Initialize tool list for this server
    if (!mockServerTools.has(this.name)) {
        mockServerTools.set(this.name, []);
    }
  }

  tool(name: string, description: string, schema: any, handler: Function) {
    mockToolHandlers.set(name, handler);
    mockServerTools.get(this.name)?.push({
        name,
        description,
        inputSchema: schema
    });
  }

  async connect(transport: any) {
      // no-op for mock
      console.log(`[MockMcpServer] ${this.name} connected.`);
  }
}

// Mock implementation of Client
export class MockMCPClient {
    constructor(private serverName: string) {}

    async callTool({ name, arguments: args }: { name: string, arguments: any }) {
        const handler = mockToolHandlers.get(name);
        if (!handler) {
            console.error(`[MockMCPClient] Tool ${name} not found in registry.`);
            throw new Error(`Tool ${name} not found`);
        }
        // console.log(`[MockMCPClient] Calling tool ${name} with args:`, args);
        return handler(args);
    }

    async listTools() {
        return { tools: mockServerTools.get(this.serverName) || [] };
    }

    async close() {}
}

// Mock implementation of MCP class from src/mcp.ts
export class MockMCP {
    private clients = new Map<string, MockMCPClient>();

    async init() {
        // console.log("[MockMCP] Initialized.");
    }

    async startServer(name: string) {
        // In this integration test setup, the servers (Brain, HR)
        // should be instantiated manually in the test setup,
        // which registers their tools into the static maps above.
        // So startServer just ensures we can get a client for it.
        if (!this.clients.has(name)) {
            this.clients.set(name, new MockMCPClient(name));
        }
        return `Started mock server ${name}`;
    }

    isServerRunning(name: string) {
        return this.clients.has(name) || mockServerTools.has(name);
    }

    getClient(name: string) {
        if (!this.clients.has(name)) {
            this.clients.set(name, new MockMCPClient(name));
        }
        return this.clients.get(name);
    }

    listServers() {
        return Array.from(mockServerTools.keys()).map(name => ({
            name,
            status: 'running', // Assume running if registered
            source: 'mock'
        }));
    }

    async getTools() {
        const allTools: any[] = [];
        for (const [serverName, tools] of mockServerTools.entries()) {
            allTools.push(...tools.map(t => ({
                ...t,
                server: serverName,
                execute: async (args: any) => {
                    const handler = mockToolHandlers.get(t.name);
                    return handler ? handler(args) : null;
                }
            })));
        }
        return allTools;
    }
}
