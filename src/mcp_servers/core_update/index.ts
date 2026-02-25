import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "url";
import { analyzeCodeSmellTool, proposeCoreUpdateTool, applyCoreUpdateTool } from "./tools.js";

export class CoreUpdateServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "core_update",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      analyzeCodeSmellTool.name,
      analyzeCodeSmellTool.description,
      analyzeCodeSmellTool.parameters,
      analyzeCodeSmellTool.execute
    );

    this.server.tool(
      proposeCoreUpdateTool.name,
      proposeCoreUpdateTool.description,
      proposeCoreUpdateTool.parameters,
      proposeCoreUpdateTool.execute
    );

    this.server.tool(
      applyCoreUpdateTool.name,
      applyCoreUpdateTool.description,
      applyCoreUpdateTool.parameters,
      applyCoreUpdateTool.execute
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Core Update MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CoreUpdateServer();
  server.run().catch((err) => {
    console.error("Fatal error in Core Update MCP Server:", err);
    process.exit(1);
  });
}
