import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const MCP_CONFIG_PATH = join(process.cwd(), "mcp.json");

function migrate() {
  console.log("Migrating mcp.json...");

  let config: any = {};
  if (existsSync(MCP_CONFIG_PATH)) {
    try {
      config = JSON.parse(readFileSync(MCP_CONFIG_PATH, "utf-8"));
    } catch (e) {
      console.error("Failed to parse mcp.json:", e);
      process.exit(1);
    }
  }

  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  const servers = config.mcpServers;

  // Add filesystem server if missing
  if (!servers.filesystem) {
    console.log("Adding filesystem server...");
    servers.filesystem = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "."],
      env: {}
    };
  }

  // Add git server if missing
  if (!servers.git) {
    console.log("Adding git server...");
    servers.git = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-git", "."],
      env: {}
    };
  }

  // Note: context_manager is local and auto-discovered, so we don't strictly need to add it here.
  // But if we want to be explicit or if we want to ensure it runs with specific env vars:
  // We'll leave it to auto-discovery for now as per plan.

  try {
    writeFileSync(MCP_CONFIG_PATH, JSON.stringify(config, null, 2));
    console.log("mcp.json updated successfully.");
  } catch (e) {
    console.error("Failed to write mcp.json:", e);
    process.exit(1);
  }
}

migrate();
