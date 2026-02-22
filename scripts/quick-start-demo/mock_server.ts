import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "simple-cli-demo-server",
  version: "1.0.0",
});

// Aider Tool
server.tool(
  "aider_chat",
  "Chat with Aider about your code or ask it to make edits.",
  {
    message: z.string().describe("The message or instruction for Aider."),
    files: z.array(z.string()).optional().describe("List of file paths to include in the context."),
  },
  async ({ message, files }) => {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return {
      content: [
        {
          type: "text",
          text: `[Aider Simulation]Processed message: "${message}"\nAnalyzed files: ${files?.join(", ") || "none"}\n\nApplied changes to fix the issue.`,
        },
      ],
    };
  }
);

// CrewAI Tool
server.tool(
  "start_crew",
  "Start a CrewAI crew to perform a complex task using multiple agents.",
  {
    task: z.string().describe("The task description for the crew to execute."),
  },
  async ({ task }) => {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 2000));
    return {
      content: [
        {
          type: "text",
          text: `[CrewAI Simulation] Crew started for task: "${task}"\n\nAgent 'Researcher' started...\nAgent 'Writer' started...\n\nFinal Report: The research indicates that the topic is highly relevant...`,
        },
      ],
    };
  }
);

// v0.dev Tool
server.tool(
  "v0dev_generate_component",
  "Generate a UI component using v0.dev based on a text description.",
  {
    prompt: z.string().describe("Description of the UI component to generate."),
    framework: z.enum(["react", "vue", "html"]).optional().describe("Target framework (default: react)."),
  },
  async ({ prompt, framework }) => {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const id = `sim-${Date.now()}`;
    return {
      content: [
        {
          type: "text",
          text: `[v0.dev Simulation] Successfully generated component (ID: ${id})\nPreview: https://v0.dev/r/${id}\n\n// React Component Code...`,
        },
      ],
    };
  }
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Simple CLI Demo MCP Server running on stdio");
}

run().catch((err) => {
  console.error("Fatal error in Demo MCP Server:", err);
  process.exit(1);
});
