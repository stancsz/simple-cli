import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { readdir } from "fs/promises";
import { join } from "path";
import { log } from "@clack/prompts";
import { spawn } from "child_process";
import { logMetric } from "./logger.js";
import { MCP_SERVER_REGISTRY, ToolDefinition } from "./mcp_servers/index.js";

interface AgentConfig {
  command: string;
  args: string[];
  description: string;
  supports_stdin?: boolean;
  env?: Record<string, string>;
  context_flag?: string;
}

interface DiscoveredServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  source: 'config' | 'local';
  warmup?: boolean;
}

export class MCPManager {
  protected clients: Map<string, Client> = new Map();
  protected discoveredServers: Map<string, DiscoveredServer> = new Map();
  protected agents: Record<string, AgentConfig> = {};
  protected pendingConnections: Map<string, Promise<string>> = new Map();

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
            source: 'config',
            warmup: (cfg as any).warmup
          });
        }

        // Load Agents
        this.agents = config.agents || {};

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
          const name = entry.name;

          // Skip the index file used for lazy loading registry
          if (name === "index.ts" || name === "index.js") continue;

          if (entry.isDirectory()) {
            if (this.discoveredServers.has(name)) continue; // Skip if already loaded from config

            const serverScript = join(localServersDir, name, "index.ts");
            if (existsSync(serverScript)) {
               this.discoveredServers.set(name, {
                 name,
                 command: "npx",
                 args: ["tsx", serverScript],
                 env: process.env as any,
                 source: 'local',
                 warmup: false // Local discovery defaults to lazy
               });
            }
          } else if (entry.isFile() && name.endsWith(".ts")) {
            const serverName = name.replace(/\.ts$/, "");
            if (this.discoveredServers.has(serverName)) continue;

            const serverScript = join(localServersDir, name);
            this.discoveredServers.set(serverName, {
                name: serverName,
                command: "npx",
                args: ["tsx", serverScript],
                env: process.env as any,
                source: 'local',
                warmup: false
            });
          }
        }
      } catch (e) {
        log.error(`Error scanning local MCP servers: ${e}`);
      }
    }

    // 3. Process Warmup
    const warmupPromises = [];
    for (const server of this.discoveredServers.values()) {
        if (server.warmup) {
            warmupPromises.push(this.startServer(server.name).catch(e => {
                log.error(`Failed to warmup server '${server.name}': ${e.message}`);
            }));
        }
    }

    if (warmupPromises.length > 0) {
        log.info(`Warming up ${warmupPromises.length} servers...`);
        await Promise.all(warmupPromises); // Wait for critical servers to start?
        // Usually warmup implies we want them ready, so awaiting is safer, but parallel.
    }

    // Log discovery summary
    const count = this.discoveredServers.size;
    if (count > 0) {
        log.info(`Discovered ${count} MCP servers (lazy loaded).`);
    }
  }

  async startServer(name: string): Promise<string> {
      if (this.clients.has(name)) {
          return `Server '${name}' is already running.`;
      }

      // Prevent double-start via pendingConnections (Mutex)
      if (this.pendingConnections.has(name)) {
          return this.pendingConnections.get(name)!;
      }

      const promise = (async () => {
          try {
              const config = this.discoveredServers.get(name);
              if (!config) {
                  throw new Error(`Server '${name}' not found in discovered servers.`);
              }

              log.info(`Starting server '${name}'...`);
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
          } finally {
              this.pendingConnections.delete(name);
          }
      })();

      this.pendingConnections.set(name, promise);
      return promise;
  }

  isServerRunning(name: string): boolean {
    return this.clients.has(name);
  }

  getClient(name: string): Client | undefined {
    return this.clients.get(name);
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

    // Add Agent tools
    for (const [name, agent] of Object.entries(this.agents)) {
        const inputSchema: any = {
            type: "object",
            properties: {
                args: {
                    type: "array",
                    items: { type: "string" },
                    description: `Arguments for ${name}`
                }
            },
            required: ["args"]
        };

        if (agent.supports_stdin) {
            inputSchema.properties.input = {
                type: "string",
                description: "Input to pass to stdin"
            };
        }

        all.push({
            name: name,
            description: agent.description,
            inputSchema: inputSchema,
            execute: async ({ args, input }: { args: string[], input?: string }) => {
                return new Promise((resolve, reject) => {
                    const finalArgs = [...(agent.args || []), ...(args || [])];
                    const env = { ...process.env, ...(agent.env || {}) };

                    const proc = spawn(agent.command, finalArgs, {
                        env: env as any,
                        shell: false
                    });

                    if (agent.supports_stdin && input) {
                        proc.stdin.write(input);
                        proc.stdin.end();
                    }

                    let stdout = "";
                    let stderr = "";

                    proc.stdout.on("data", (data) => stdout += data.toString());
                    proc.stderr.on("data", (data) => stderr += data.toString());

                    proc.on("close", (code) => {
                        if (code === 0) {
                            resolve(stdout.trim() || `Agent ${name} completed successfully.`);
                        } else {
                            resolve(`Agent ${name} failed (exit code ${code}):\n${stderr}\n${stdout}`);
                        }
                    });

                    proc.on("error", (err) => {
                        resolve(`Failed to start agent ${name}: ${err.message}`);
                    });
                });
            }
        });
    }

    // ---------------------------------------------------------
    // LAZY LOADING LOGIC
    // ---------------------------------------------------------

    // 1. Add tools from already running servers (Dynamic)
    for (const [name, client] of this.clients) {
      try {
        const { tools } = await client.listTools();
        all.push(
          ...tools.map((t) => ({
            ...t,
            execute: async (args: any) => {
              const start = Date.now();
              try {
                const res = await client.callTool({ name: t.name, arguments: args });
                logMetric('mcp', 'mcp_tool_execution_time', Date.now() - start, { tool: t.name, server: name });
                return res;
              } catch (e) {
                logMetric('mcp', 'mcp_tool_execution_time', Date.now() - start, { tool: t.name, server: name, status: 'error' });
                throw e;
              }
            },
            source: "mcp" as const,
            server: name,
          })),
        );
      } catch (e) {
        log.error(`Error listing tools for ${name}: ${e}`);
      }
    }

    // 2. Add tools from the static registry for STOPPED servers (Lazy)
    for (const [serverName, tools] of Object.entries(MCP_SERVER_REGISTRY)) {
        if (this.clients.has(serverName)) continue; // Already handled above

        // Only register if the server is discovered/configured
        if (this.discoveredServers.has(serverName)) {
            all.push(...tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                source: "mcp" as const,
                server: serverName,
                execute: async (args: any) => {
                    // Check connection
                    if (!this.clients.has(serverName)) {
                        log.info(`[LazyLoad] Starting server '${serverName}' for tool '${tool.name}'...`);
                        await this.startServer(serverName);
                    }

                    let client = this.clients.get(serverName);
                    if (!client) throw new Error(`Failed to acquire client for ${serverName}`);

                    const start = Date.now();
                    try {
                        const res = await client.callTool({ name: tool.name, arguments: args });
                        logMetric('mcp', 'mcp_tool_execution_time', Date.now() - start, { tool: tool.name, server: serverName });
                        return res;
                    } catch (e: any) {
                         // Retry Logic
                         log.warn(`Tool execution failed for ${serverName}, attempting restart... Error: ${e.message}`);
                         logMetric('mcp', 'mcp_tool_execution_time', Date.now() - start, { tool: tool.name, server: serverName, status: 'retry' });

                         try {
                             await this.stopServer(serverName);
                             await this.startServer(serverName);
                             client = this.clients.get(serverName);
                             if (!client) throw new Error(`Failed to restart server ${serverName}`);

                             const res = await client.callTool({ name: tool.name, arguments: args });
                             log.success(`Retry successful for ${serverName}`);
                             return res;
                         } catch (retryError: any) {
                             log.error(`Retry failed for ${serverName}: ${retryError.message}`);
                             logMetric('mcp', 'mcp_tool_execution_time', Date.now() - start, { tool: tool.name, server: serverName, status: 'error' });
                             throw retryError; // Throw original or retry error? Maybe retry error.
                         }
                    }
                }
            })));
        }
    }

    return all;
  }
}
