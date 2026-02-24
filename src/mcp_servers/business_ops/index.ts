import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { join } from "path";
import { existsSync } from "fs";
import { registerTools } from "./tools.js";
import { registerXeroTools } from "./xero_tools.js";
import { registerProjectManagementTools } from "./project_management.js";

// Load secrets from .env.agent
const envPath = join(process.cwd(), ".env.agent");
if (existsSync(envPath)) {
  config({ path: envPath });
}

// Initialize Server
const server = new McpServer({
  name: "business_ops",
  version: "1.0.0",
});

// Register Tools
registerTools(server);
registerXeroTools(server);
registerProjectManagementTools(server);

// Start Server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Business Operations MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
