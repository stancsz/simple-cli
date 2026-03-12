import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

export class ValidationMetricsServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "validation_metrics",
      version: "1.0.0",
    });

    registerTools(this.server);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Validation Metrics MCP Server running on stdio");
  }

  public getServer() {
    return this.server;
  }
}

import { fileURLToPath } from "url";
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new ValidationMetricsServer();
  server.run().catch((err) => {
    console.error("Fatal error in Validation Metrics MCP Server:", err);
    process.exit(1);
  });
}
