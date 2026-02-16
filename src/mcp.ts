import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import { log } from "@clack/prompts";

interface DiscoveredServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
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
            url: (cfg as any).url,
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

        let transport;
        if (config.url) {
            transport = new SSEClientTransport(new URL(config.url));
        } else if (config.command) {
            transport = new StdioClientTransport({
              command: config.command,
              args: config.args || [],
              env: { ...process.env, ...config.env } as any,
            });
        } else {
            throw new Error(`Server '${name}' has no command or url configured.`);
        }

        await client.connect(transport);
        this.clients.set(name, client);
        log.success(`Connected to MCP: ${name}`);
        return `Successfully started server '${name}'.`;
      } catch (e: any) {
        log.error(`Failed to connect to MCP ${name}: ${e}`);
        throw new Error(`Failed to start server '${name}': ${e.message}`);
      }
  }

  isServerRunning(name: string): boolean {
    return this.clients.has(name);
  }

  async stopServer(name: string) {
    const client = this.clients.get(name);
    if (client) {
      try {
        await client.close();
      } catch (e) {
        // ignore error during close
      }
      this.clients.delete(name);
      return `Stopped server '${name}'.`;
    }
    return `Server '${name}' is not running.`;
  }

  listServers() {
      return Array.from(this.discoveredServers.values()).map(s => ({
          name: s.name,
          source: s.source,
          status: this.clients.has(s.name) ? 'running' : 'stopped'
      }));
  }

  private async fetchRegistry(query?: string) {
    try {
      const url = new URL("https://registry.modelcontextprotocol.io/v0.1/servers");
      url.searchParams.set("limit", "100");

      let allServers: any[] = [];
      let nextCursor: string | null = null;

      do {
          if (nextCursor) url.searchParams.set("cursor", nextCursor);

          const res = await fetch(url.toString());
          if (!res.ok) throw new Error(res.statusText);

          const data = await res.json() as any;
          allServers = allServers.concat(data.servers || []);
          nextCursor = data.metadata?.nextCursor;

          // Safety break
          if (allServers.length > 2000) break;
      } while (nextCursor);

      if (query) {
        const q = query.toLowerCase();
        return allServers.filter((s: any) =>
          (s.server.name && s.server.name.toLowerCase().includes(q)) ||
          (s.server.description && s.server.description.toLowerCase().includes(q))
        );
      }
      return allServers;
    } catch (e) {
      log.error(`Error fetching registry: ${e}`);
      return [];
    }
  }

  private async installServer(name: string, env: Record<string, string> = {}) {
      const servers = await this.fetchRegistry();
      const server = servers.find((s: any) => s.server.name === name);

      if (!server) {
          throw new Error(`Server '${name}' not found in registry.`);
      }

      const npmPackage = server.server.packages?.find((p: any) => p.registryType === "npm");

      // Currently only supporting NPM packages for auto-install
      if (!npmPackage) {
          throw new Error(`Server '${name}' does not have an NPM package available for installation.`);
      }

      const identifier = npmPackage.identifier;
      const requiredEnv = npmPackage.environmentVariables || [];

      const definedEnvNames = requiredEnv.map((e: any) => e.name);
      const providedEnvNames = Object.keys(env);
      const missing = definedEnvNames.filter((name: string) => !providedEnvNames.includes(name) && !process.env[name]);

      if (missing.length > 0) {
          return `Installation halted. The following environment variables are recommended/required: ${missing.join(", ")}. Please provide them in the 'env' argument.`;
      }

      // Update mcp.json
      const configPath = join(process.cwd(), "mcp.json");
      let config: any = {};
      if (existsSync(configPath)) {
          try {
              config = JSON.parse(readFileSync(configPath, "utf-8"));
          } catch (e) {
              log.error(`Error reading mcp.json: ${e}`);
          }
      }

      if (!config.mcpServers) config.mcpServers = {};

      config.mcpServers[name] = {
          command: "npx",
          args: ["-y", identifier],
          env: env
      };

      try {
          writeFileSync(configPath, JSON.stringify(config, null, 2));
      } catch (e) {
          throw new Error(`Failed to write mcp.json: ${e}`);
      }

      // Update discoveredServers
      this.discoveredServers.set(name, {
          name,
          command: "npx",
          args: ["-y", identifier],
          env: env,
          source: 'config'
      });

      return `Successfully installed server '${name}'. You can now start it using 'mcp_start_server'.`;
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
        name: "mcp_search_server",
        description: "Search for MCP servers in the official registry.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query (name or description)" }
            }
        },
        execute: async ({ query }: { query?: string }) => {
            const servers = await this.fetchRegistry(query);
            if (servers.length === 0) return "No servers found in registry matching the query.";

            return servers.map((s: any) => {
                const name = s.server.name;
                const desc = s.server.description || "No description";
                const pkg = s.server.packages?.[0];
                const installType = pkg?.registryType || "unknown";
                const identifier = pkg?.identifier || "unknown";
                return `- ${name} (${installType}: ${identifier})\n  ${desc}`;
            }).join("\n\n");
        }
    });

    all.push({
        name: "mcp_install_server",
        description: "Install an MCP server from the registry.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Name of the server to install (as listed in registry)" },
                env: { type: "object", description: "Environment variables required by the server", additionalProperties: { type: "string" } }
            },
            required: ["name"]
        },
        execute: async ({ name, env }: { name: string, env?: Record<string, string> }) => {
            return await this.installServer(name, env || {});
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
