import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";

export class ForecastingServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "forecasting",
      version: "1.0.0",
    });

    // Register forecasting tools
    registerTools(this.server);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Forecasting MCP Server running on stdio");
  }

  // Used for testing/mocking
  public getServer() {
    return this.server;
  }
}

// Check if this module is run directly
import { fileURLToPath } from "url";
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new ForecastingServer();
  server.run().catch((err) => {
    console.error("Fatal error in Forecasting MCP Server:", err);
    process.exit(1);
  });
}
