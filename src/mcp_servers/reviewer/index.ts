import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Reviewer } from "../../reviewer/index.js";

const server = new McpServer({
  name: "reviewer",
  version: "1.0.0",
});

server.tool(
  "run_morning_standup",
  "Run the Morning Standup review, analyzing logs from the last 24 hours.",
  {},
  async () => {
    const reviewer = new Reviewer(process.cwd());
    const report = await reviewer.runMorningStandup();
    return {
      content: [
        {
          type: "text",
          text: report,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Reviewer MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
