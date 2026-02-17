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
  mcp_server?: string;
  tool_name?: string;
}

export interface Config {
  mcpServers?: Record<string, any>;
  agents?: Record<string, AgentConfig>;
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

  if (config.agents) {
    for (const [name, agent] of Object.entries(config.agents)) {
      if (!agent.command || !Array.isArray(agent.args) || !agent.description) {
        console.warn(`Warning: Agent '${name}' is missing required fields (command, args, description).`);
      }
    }
  }

  return config;
}
