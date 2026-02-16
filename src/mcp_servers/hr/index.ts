import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runHRLoop } from "../../optimization/hr_loop.js";

const server = new McpServer({
  name: "hr-manager",
  version: "1.0.0",
});

server.tool(
  "run_hr_optimization",
  "Run the HR optimization loop to analyze agent logs and improve their instructions (Souls).",
  {},
  async () => {
    try {
      const result = await runHRLoop();
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HR Manager MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
