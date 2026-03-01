import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "url";
import { registerSecurityTools } from "./tools/security_tools.js";

export class SecurityMonitorServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "security_monitor",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    registerSecurityTools(this.server);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Security Monitor MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SecurityMonitorServer();
  server.run().catch((err) => {
    console.error("Fatal error in Security Monitor MCP Server:", err);
    process.exit(1);
  });
}
