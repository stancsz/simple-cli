import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "url";
import { Agent } from "./types.js";
import { registerTools } from "./tools.js";
import { EpisodicMemory } from "../../brain/episodic.js";

export class HiveMindServer {
  private server: McpServer;
  public activeAgents: Map<string, Agent> = new Map();
  public episodicMemory: EpisodicMemory;

  constructor() {
    this.server = new McpServer({
      name: "hive_mind",
      version: "1.0.0",
    });

    this.episodicMemory = new EpisodicMemory();

    // Register Tools
    registerTools(this.server, {
        activeAgents: this.activeAgents,
        episodicMemory: this.episodicMemory
    });

    // Additional self-inspection tool
    this.server.tool(
        "list_hive_agents",
        "List all active agents in the hive.",
        {},
        async () => {
            const agents = Array.from(this.activeAgents.values()).map(a => ({
                id: a.id,
                role: a.role,
                status: a.status,
                capabilities: a.capabilities
            }));

            return {
                content: [{ type: "text", text: JSON.stringify(agents, null, 2) }]
            };
        }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Hive Mind MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new HiveMindServer();
  server.run().catch((err) => {
    console.error("Fatal error in Hive Mind MCP Server:", err);
    process.exit(1);
  });
}
