import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from "fs";
import { readdir } from "fs/promises";
import { join, dirname } from "path";
import { log } from "@clack/prompts";
import { createHash } from "crypto";

interface CachedServer {
  name: string;
  path: string;
  mtime: number;
  tools: any[];
  config: any; // Transport config
}

interface ServerState {
  client?: Client;
  config: any;
  tools: any[];
  name: string;
  path?: string;
}

export class MCP {
  private servers: Map<string, ServerState> = new Map();
  private cacheFile: string;

  constructor() {
    this.cacheFile = join(process.cwd(), ".agent", "mcp_cache.json");
  }

  async init() {
    // Ensure .agent dir exists
    if (!existsSync(dirname(this.cacheFile))) {
      mkdirSync(dirname(this.cacheFile), { recursive: true });
    }

    let cache: Record<string, CachedServer> = {};
    if (existsSync(this.cacheFile)) {
      try {
        cache = JSON.parse(readFileSync(this.cacheFile, "utf-8"));
      } catch (e) {
        // Ignore corrupted cache
      }
    }

    // 1. Load from mcp.json (External/Configured servers) - usually always connect or check
    // For now, we'll treat them as lazy too if possible, but usually these are persistent.
    // Let's implement lazy for local discovered ones primarily using cache.

    // ... (Existing mcp.json logic could be adapted, but focusing on local discovery bloat)

    // 2. Auto-discover local MCP servers
    const localServersDir = join(process.cwd(), "src", "mcp_servers");
    if (existsSync(localServersDir)) {
      try {
        const entries = await readdir(localServersDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const name = entry.name;
            const serverScript = join(localServersDir, name, "index.ts");

            if (existsSync(serverScript)) {
              const stats = statSync(serverScript);
              const mtime = stats.mtimeMs;
              const cached = cache[name];

              const transportConfig = {
                command: "npx", // or "node" if compiled
                args: ["tsx", serverScript],
                env: process.env as any,
              };

              // Check cache
              if (cached && cached.mtime === mtime) {
                // Cache hit: Use cached tools, don't start server yet
                this.servers.set(name, {
                  config: transportConfig,
                  tools: cached.tools,
                  name,
                  path: serverScript
                });
                log.info(`Loaded cached MCP tools: ${name}`);
              } else {
                // Cache miss: Must start server to list tools
                log.info(`Discovering MCP: ${name} (starting server...)`);
                try {
                  const client = new Client(
                    { name: "simple-cli", version: "1.0.0" },
                    { capabilities: {} },
                  );
                  const transport = new StdioClientTransport(transportConfig);
                  await client.connect(transport);
                  const { tools } = await client.listTools();

                  // Store in memory
                  this.servers.set(name, {
                    client, // Keep connected? Or disconnect?
                    // To strictly lazy load, we should disconnect now. 
                    // But connecting is expensive. 
                    // Let's disconnect to save RAM/CPU, and reconnect on demand.
                    config: transportConfig,
                    tools,
                    name,
                    path: serverScript
                  });

                  // Update cache
                  cache[name] = {
                    name,
                    path: serverScript,
                    mtime,
                    tools,
                    config: transportConfig
                  };

                  // Graceful disconnect to save resources
                  // Note: Client SDK doesn't always have clean close(), but transport does.
                  // We'll leave it connected for this session if it's the *first* time (to avoid double connect latency immediately if used)
                  // Actually, for "bloat", we should disconnect. 
                  // But user might use it immediately.
                  // User said "not bloat up... stuck at runtime".
                  // Let's disconnect.
                  // await client.close(); -- SDK might not expose close easily on client?
                  // StdioTransport has close().
                  (transport as any).close?.();
                  this.servers.get(name)!.client = undefined;

                } catch (e) {
                  log.error(`Failed to scan MCP ${name}: ${e}`);
                }
              }
            }
          }
        }
      } catch (e) {
        log.error(`Error scanning local MCP servers: ${e}`);
      }
    }

    // Save cache
    try {
      writeFileSync(this.cacheFile, JSON.stringify(cache, null, 2));
    } catch { }
  }

  async getTools() {
    const all = [];
    for (const [name, state] of this.servers) {
      all.push(
        ...state.tools.map((t) => ({
          ...t,
          execute: async (args: any) => {
            // Lazy Connect
            let client = state.client;
            if (!client) {
              log.info(`Starting MCP server: ${name}...`);
              client = new Client(
                { name: "simple-cli", version: "1.0.0" },
                { capabilities: {} },
              );
              const transport = new StdioClientTransport(state.config);
              await client.connect(transport);
              state.client = client;
            }
            return client.callTool({ name: t.name, arguments: args });
          },
          source: "mcp" as const,
          server: name,
        })),
      );
    }
    return all;
  }
}
