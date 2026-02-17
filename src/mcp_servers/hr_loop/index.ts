import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeAgent } from "./performance.js";
import { updateSoul } from "./soul.js";
import { fileURLToPath } from "url";
import process from "process";

const server = new McpServer({
  name: "hr-loop",
  version: "1.0.0",
});

server.tool(
  "analyze_agent_performance",
  "Analyze the performance of a specific agent based on recent logs.",
  {
    agent_name: z.string().describe("The name of the agent to analyze (e.g., 'aider', 'crewai')."),
    days: z.number().optional().describe("Number of days of logs to analyze (default: 7)."),
  },
  async ({ agent_name, days }) => {
    try {
      const result = await analyzeAgent(agent_name, days || 7);
      return {
        content: [{ type: "text", text: result || "Analysis complete." }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "update_agent_soul",
  "Update the 'Soul' (System Instructions) of an agent with new instructions.",
  {
    agent_name: z.string().describe("The name of the agent to update."),
    new_instructions: z.string().describe("The new instructions to merge into the soul."),
    yoloMode: z.boolean().optional().describe("If true, applies the changes directly. If false (default), creates a proposal file for review."),
  },
  async ({ agent_name, new_instructions, yoloMode }) => {
    try {
      const result = await updateSoul(agent_name, new_instructions, yoloMode || false);
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
  console.error("HR Loop MCP Server running on stdio");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
