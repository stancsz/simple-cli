import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "url";
import { registerStoreMemory } from "./tools/storeMemory.js";
import { registerQueryMemory } from "./tools/queryMemory.js";

export class BrainServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "brain",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    registerStoreMemory(this.server);
    registerQueryMemory(this.server);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Brain MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new BrainServer();
  server.run().catch((err) => {
    console.error("Fatal error in Brain MCP Server:", err);
    process.exit(1);
  });
}
