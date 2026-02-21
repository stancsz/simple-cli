import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export interface Config {
  mcpServers?: Record<string, any>;
  yoloMode?: boolean;
  autoDecisionTimeout?: number;
  companies?: string[];
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

  return config;
}
