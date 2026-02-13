import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { log } from "@clack/prompts";

export class MCP {
  private clients: Map<string, Client> = new Map();

  async init() {
    const configPath = join(process.cwd(), "mcp.json");
    if (!existsSync(configPath)) return;

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
  }

  async getTools() {
    const all = [];
    for (const [name, client] of this.clients) {
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
    }
    return all;
  }
}
