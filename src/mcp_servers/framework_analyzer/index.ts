import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyze_cli_tool, generate_mcp_scaffold } from "./tools.js";

// Initialize Server
const server = new McpServer({
  name: "framework-analyzer",
  version: "1.0.0",
});

// Define Tool: Analyze CLI Tool
server.tool(
  "analyze_cli_tool",
  "Analyzes a CLI tool to understand its capabilities, commands, and arguments.",
  {
    target_command: z.string().describe("The CLI command to analyze (e.g., 'docker', 'git')."),
    help_text: z.string().optional().describe("The help text output of the command. If provided, analysis is faster and more accurate. If omitted, the tool attempts to run the command."),
  },
  async ({ target_command, help_text }) => {
    return await analyze_cli_tool(target_command, help_text);
  }
);

// Define Tool: Generate MCP Scaffold
server.tool(
  "generate_mcp_scaffold",
  "Generates a TypeScript MCP server scaffold based on the analysis result.",
  {
    framework_name: z.string().describe("The name of the framework (e.g., 'docker-mcp')."),
    analysis_result: z.object({}).passthrough().describe("The analysis result from 'analyze_cli_tool'."),
  },
  async ({ framework_name, analysis_result }) => {
    return await generate_mcp_scaffold(framework_name, analysis_result);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Framework Analyzer MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
