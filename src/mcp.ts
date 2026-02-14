import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import { log } from "@clack/prompts";

export class MCP {
  private clients: Map<string, Client> = new Map();

  async init() {
    // 1. Load from mcp.json
    const configPath = join(process.cwd(), "mcp.json");
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const servers = config.mcpServers || config.servers || {};

        for (const [name, cfg] of Object.entries(servers)) {
          try {
            const client = new Client(
              { name: "simple-cli", version: "1.0.0" },
              { capabilities: {} },
            );
            const transport = new StdioClientTransport({
              command: (cfg as any).command,
              args: (cfg as any).args || [],
              env: { ...process.env, ...((cfg as any).env || {}) } as any,
            });
            await client.connect(transport);
            this.clients.set(name, client);
            log.success(`Connected to MCP: ${name}`);
          } catch (e) {
            log.error(`Failed to connect to MCP ${name}: ${e}`);
          }
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
            if (this.clients.has(name)) continue; // Skip if already loaded

            const serverScript = join(localServersDir, name, "index.ts");
            if (existsSync(serverScript)) {
              try {
                const client = new Client(
                  { name: "simple-cli", version: "1.0.0" },
                  { capabilities: {} },
                );

                // Determine execution command
                // Default to using 'tsx' for TS files in dev environment
                // We use npx tsx to ensure it works without global install
                // Alternatively, node --loader ts-node/esm
                const transport = new StdioClientTransport({
                  command: "npx",
                  args: ["tsx", serverScript],
                  env: process.env as any,
                });

                await client.connect(transport);
                this.clients.set(name, client);
                log.success(`Connected to Local MCP: ${name}`);
              } catch (e) {
                log.error(`Failed to connect to Local MCP ${name}: ${e}`);
              }
            }
          }
        }
      } catch (e) {
        log.error(`Error scanning local MCP servers: ${e}`);
      }
    }
  }

  async getTools() {
    const all = [];
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
