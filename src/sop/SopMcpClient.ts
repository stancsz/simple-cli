import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";

interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class SopMcpClient {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, { server: string; execute: (args: any) => Promise<any> }> = new Map();

  async init(cwd: string = process.cwd()) {
    // 1. Load from mcp.json
    const configPath = join(cwd, "mcp.json");
    if (existsSync(configPath)) {
      try {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        const servers = config.mcpServers || config.servers || {};

        for (const [name, cfg] of Object.entries(servers)) {
          if (name === "sop") continue; // Skip self to avoid recursion
          await this.connectToServer(name, {
            command: (cfg as any).command,
            args: (cfg as any).args || [],
            env: (cfg as any).env || {},
          });
        }
      } catch (e) {
        console.error(`[SopMcpClient] Error loading mcp.json: ${e}`);
      }
    }

    // 2. Auto-discover local MCP servers in src/mcp_servers/
    if (process.env.SOP_DISABLE_AUTO_DISCOVERY) {
        console.error("[SopMcpClient] Auto-discovery disabled by SOP_DISABLE_AUTO_DISCOVERY.");
        return;
    }

    const localServersDir = join(cwd, "src", "mcp_servers");
    if (existsSync(localServersDir)) {
      try {
        const entries = await readdir(localServersDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const name = entry.name;
            if (name === "sop") continue; // Skip self to avoid recursion
            if (this.clients.has(name)) continue; // Skip if already loaded via mcp.json

            const serverScript = join(localServersDir, name, "index.ts");
            if (existsSync(serverScript)) {
               await this.connectToServer(name, {
                 command: "npx", // Assumes npx is available
                 args: ["tsx", serverScript],
                 env: process.env as any,
               });
            }
          }
        }
      } catch (e) {
        console.error(`[SopMcpClient] Error scanning local MCP servers: ${e}`);
      }
    }
  }

  private async connectToServer(name: string, config: McpServerConfig) {
      try {
        const client = new Client(
          { name: "sop-client", version: "1.0.0" },
          { capabilities: {} },
        );

        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: { ...process.env, ...config.env } as any,
        });

        await client.connect(transport);
        this.clients.set(name, client);

        // Discover tools
        const { tools } = await client.listTools();
        for (const tool of tools) {
            this.tools.set(tool.name, {
                server: name,
                execute: async (args: any) => {
                    return await client.callTool({
                        name: tool.name,
                        arguments: args
                    });
                }
            });
        }

        console.error(`[SopMcpClient] Connected to ${name}, loaded ${tools.length} tools.`);
      } catch (e: any) {
        console.error(`[SopMcpClient] Failed to connect to ${name}: ${e.message}`);
      }
  }

  async executeTool(toolName: string, args: any): Promise<any> {
      const tool = this.tools.get(toolName);
      if (!tool) {
          throw new Error(`Tool '${toolName}' not found.`);
      }
      return await tool.execute(args);
  }

  getToolNames(): string[] {
      return Array.from(this.tools.keys());
  }

  async close() {
      for (const [name, client] of this.clients) {
          try {
              await client.close();
          } catch (e) {
              console.error(`[SopMcpClient] Error closing client ${name}: ${e}`);
          }
      }
  }
}
