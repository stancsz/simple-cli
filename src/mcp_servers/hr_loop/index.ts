import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools } from "./tools.js";
import { fileURLToPath } from "url";

const server = new McpServer({
  name: "hr_loop",
  version: "1.0.0",
});

for (const tool of tools) {
  server.tool(tool.name, tool.description, tool.args, tool.execute);
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HR Loop MCP Server running on stdio");
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main().catch((err) => {
    console.error("Fatal error in HR Loop MCP Server:", err);
    process.exit(1);
  });
}
