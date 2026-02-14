import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import { log } from "@clack/prompts";

interface DiscoveredServer {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  source: 'config' | 'local';
}

export class MCP {
  private clients: Map<string, Client> = new Map();
  private discoveredServers: Map<string, DiscoveredServer> = new Map();

  async init() {
    // 1. Load from mcp.json
    const configPath = join(process.cwd(), "mcp.json");
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const servers = config.mcpServers || config.servers || {};

        for (const [name, cfg] of Object.entries(servers)) {
          this.discoveredServers.set(name, {
            name,
            command: (cfg as any).command,
            args: (cfg as any).args || [],
            env: (cfg as any).env || {},
            source: 'config'
          });
        }
      } catch (e) {
        log.error(`Error loading mcp.json: ${e}`);
      }
    }

    // 2. Auto-discover local MCP servers in src/mcp_servers/
    const localServersDir = join(process.cwd(), "src", "mcp_servers");
    if (existsSync(localServersDir)) {
      try {
        const entries = await readdir(localServersDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const name = entry.name;
            if (this.discoveredServers.has(name)) continue; // Skip if already loaded from config

            const serverScript = join(localServersDir, name, "index.ts");
            if (existsSync(serverScript)) {
               this.discoveredServers.set(name, {
                 name,
                 command: "npx",
                 args: ["tsx", serverScript],
                 env: process.env as any,
                 source: 'local'
               });
            }
          }
        }
      } catch (e) {
        log.error(`Error scanning local MCP servers: ${e}`);
      }
    }

    // Log discovery summary
    const count = this.discoveredServers.size;
    if (count > 0) {
        log.info(`Discovered ${count} MCP servers (not started). Use 'mcp_list_servers' and 'mcp_start_server' to manage them.`);
    }
  }

  async startServer(name: string) {
      if (this.clients.has(name)) {
          return `Server '${name}' is already running.`;
      }

      const config = this.discoveredServers.get(name);
      if (!config) {
          throw new Error(`Server '${name}' not found in discovered servers.`);
      }

      try {
        const client = new Client(
          { name: "simple-cli", version: "1.0.0" },
          { capabilities: {} },
        );

        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: { ...process.env, ...config.env } as any,
        });

        await client.connect(transport);
        this.clients.set(name, client);
        log.success(`Connected to MCP: ${name}`);
        return `Successfully started server '${name}'.`;
      } catch (e: any) {
        log.error(`Failed to connect to MCP ${name}: ${e}`);
        throw new Error(`Failed to start server '${name}': ${e.message}`);
      }
  }

  listServers() {
      return Array.from(this.discoveredServers.values()).map(s => ({
          name: s.name,
          source: s.source,
          status: this.clients.has(s.name) ? 'running' : 'stopped'
      }));
  }

  async getTools() {
    const all = [];

    // Add management tools
    all.push({
        name: "mcp_list_servers",
        description: "List available MCP servers that can be started.",
        inputSchema: { type: "object", properties: {} },
        execute: async () => {
            const servers = this.listServers();
            if (servers.length === 0) return "No MCP servers found.";
            return servers.map(s => `- ${s.name} (${s.status}) [${s.source}]`).join("\n");
        }
    });

    all.push({
        name: "mcp_start_server",
        description: "Start an MCP server to enable its tools.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Name of the server to start" }
            },
            required: ["name"]
        },
        execute: async ({ name }: { name: string }) => {
            return await this.startServer(name);
        }
    });

    for (const [name, client] of this.clients) {
      try {
        const { tools } = await client.listTools();
        all.push(
          ...tools.map((t) => ({
            ...t,
            execute: (args: any) =>
              client.callTool({ name: t.name, arguments: args }),
            source: "mcp" as const,
            server: name,
          })),
        );
      } catch (e) {
        log.error(`Error listing tools for ${name}: ${e}`);
      }
    }
    return all;
  }
}
