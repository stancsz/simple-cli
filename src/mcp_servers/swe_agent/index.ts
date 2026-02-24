
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { run_swe_agent } from "./tools.js";

// Initialize Server
const server = new McpServer({
  name: "swe-agent",
  version: "1.0.0",
});

// Define Tool: Run SWE-agent
server.tool(
  "run_swe_agent",
  "Run the SWE-agent to fix a specified GitHub issue or problem description using AI.",
  {
    model_name: z.string().optional().default("gpt4").describe("Name of the AI model to use (e.g., gpt4, claude-3-opus)"),
    issue_url: z.string().optional().describe("URL of the GitHub issue to fix"),
    repo_path: z.string().optional().describe("Path to the local repository"),
    config_file: z.string().optional().describe("Path to the configuration YAML file"),
    problem_description: z.string().optional().describe("Description of the problem to solve (if issue_url is not provided)"),
  },
  async ({ model_name, issue_url, repo_path, config_file, problem_description }) => {
    return await run_swe_agent(model_name, issue_url, repo_path, config_file, problem_description);
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SWE-agent MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
