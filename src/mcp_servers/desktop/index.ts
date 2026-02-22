import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createTools } from "./tools.js";
import { DesktopBackend } from "./interfaces/DesktopBackend.js";
import { StagehandBackend } from "./backends/StagehandBackend.js";
import { AnthropicBackend } from "./backends/AnthropicBackend.js";
import { OpenAIBackend } from "./backends/OpenAIBackend.js";
import { SkyvernBackend } from "./backends/SkyvernBackend.js";
import { EpisodicMemory } from "../../brain/episodic.js";

const server = new McpServer({
  name: "desktop",
  version: "1.0.0",
});

async function main() {
  const backendType = process.env.DESKTOP_BACKEND || "stagehand";
  let backend: DesktopBackend;

  console.error(`Initializing Desktop Server with backend: ${backendType}`);

  switch (backendType.toLowerCase()) {
    case "anthropic":
      backend = new AnthropicBackend();
      break;
    case "openai":
      backend = new OpenAIBackend();
      break;
    case "skyvern":
      backend = new SkyvernBackend();
      break;
    case "stagehand":
    default:
      backend = new StagehandBackend();
      break;
  }

  let memory: EpisodicMemory | undefined;
  try {
      memory = new EpisodicMemory(process.cwd());
      await memory.init();
      console.error("Episodic Memory initialized.");
  } catch (e) {
      console.error("Failed to initialize Episodic Memory:", e);
  }

  const tools = createTools(backend, memory);

  for (const tool of tools) {
    server.tool(tool.name, tool.description, tool.parameters.shape, tool.handler);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Desktop MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
