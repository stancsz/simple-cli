import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./tools.js";

const server = new McpServer({
  name: "desktop",
  version: "1.0.0",
});

for (const tool of tools) {
  server.tool(tool.name, tool.description, tool.parameters.shape, tool.handler);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Desktop MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
