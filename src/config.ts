import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export interface AgentConfig {
  command: string;
  args: string[];
  description: string;
  supports_stdin?: boolean;
  env?: Record<string, string>;
  context_flag?: string;
}

export interface Config {
  mcpServers?: Record<string, any>;
  agents?: Record<string, AgentConfig>; // Deprecated
  yoloMode?: boolean;
  autoDecisionTimeout?: number;
}

export async function loadConfig(cwd: string = process.cwd()): Promise<Config> {
  const locations = [join(cwd, "mcp.json"), join(cwd, ".agent", "config.json")];

  let config: Config = {};

  for (const loc of locations) {
    if (existsSync(loc)) {
      try {
        const content = await readFile(loc, "utf-8");
        config = JSON.parse(content);
        break;
      } catch (e) {
        console.error(`Failed to parse config at ${loc}:`, e);
      }
    }
  }

  // Legacy agent configuration is removed.
  // Agents should be configured via MCP servers in mcp.json.
  // Default servers (e.g., aider-server, claude-server) are initialized in src/cli.ts.

  return config;
}
