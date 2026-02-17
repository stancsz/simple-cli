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

export class SopExecutorClient {
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
          if (name === "sop" || name === "sop-executor") continue; // Skip self and old sop
          await this.connectToServer(name, {
            command: (cfg as any).command,
            args: (cfg as any).args || [],
            env: (cfg as any).env || {},
          });
        }
      } catch (e) {
        console.error(`[SopExecutorClient] Error loading mcp.json: ${e}`);
      }
    }

    // 2. Auto-discover local MCP servers
    if (process.env.SOP_DISABLE_AUTO_DISCOVERY) {
        return;
    }

    const searchDirs = [
        join(cwd, "src", "mcp_servers"),
        join(cwd, "dist", "mcp_servers")
    ];

    for (const localServersDir of searchDirs) {
        if (!existsSync(localServersDir)) continue;

        try {
            const entries = await readdir(localServersDir, { withFileTypes: true });
            for (const entry of entries) {
                const name = entry.name;
                if (name === "sop" || name === "sop-executor" || name === "index.ts" || name === "index.js") continue; // Skip self, old sop, and index

                let serverScript: string | undefined;
                let serverName = name;
                let isTs = false;

                if (entry.isDirectory()) {
                    if (existsSync(join(localServersDir, name, "index.ts"))) {
                        serverScript = join(localServersDir, name, "index.ts");
                        isTs = true;
                    } else if (existsSync(join(localServersDir, name, "index.js"))) {
                        serverScript = join(localServersDir, name, "index.js");
                    }
                } else if (entry.isFile()) {
                    if (name.endsWith(".ts")) {
                        serverName = name.replace(/\.ts$/, "");
                        serverScript = join(localServersDir, name);
                        isTs = true;
                    } else if (name.endsWith(".js")) {
                        serverName = name.replace(/\.js$/, "");
                        serverScript = join(localServersDir, name);
                    }
                }

                if (serverScript && existsSync(serverScript)) {
                    if (this.clients.has(serverName)) continue; // Skip if already loaded

                    const command = isTs ? "npx" : "node";
                    const args = isTs ? ["tsx", serverScript] : [serverScript];

                    await this.connectToServer(serverName, {
                        command,
                        args,
                        env: process.env as any,
                    });
                }
            }
        } catch (e) {
            console.error(`[SopExecutorClient] Error scanning local MCP servers in ${localServersDir}: ${e}`);
        }
    }
  }

  private async connectToServer(name: string, config: McpServerConfig) {
      try {
        const client = new Client(
          { name: "sop-executor-client", version: "1.0.0" },
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
      } catch (e: any) {
        // console.error(`[SopExecutorClient] Failed to connect to ${name}: ${e.message}`);
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
              console.error(`[SopExecutorClient] Error closing client ${name}: ${e}`);
          }
      }
  }
}
