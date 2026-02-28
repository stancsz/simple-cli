import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "url";
import { registerTools } from "./tools.js";

export class DisasterRecoveryServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "disaster_recovery",
      version: "1.0.0",
    });

    registerTools(this.server);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Disaster Recovery MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new DisasterRecoveryServer();
  server.run().catch((err) => {
    console.error("Fatal error in Disaster Recovery MCP Server:", err);
    process.exit(1);
  });
}
