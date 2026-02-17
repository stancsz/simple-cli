import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "url";
import { EpisodicMemory } from "../../brain/episodic.js";
import { SemanticGraph } from "../../brain/semantic_graph.js";
import { join } from "path";
import { setupBrainTools } from "./tools.js";

export class BrainServer {
  private server: McpServer;
  private episodic: EpisodicMemory;
  private semantic: SemanticGraph;
  private sopsDir: string;

  constructor() {
    this.server = new McpServer({
      name: "brain",
      version: "1.0.0",
    });

    this.episodic = new EpisodicMemory();
    this.semantic = new SemanticGraph();
    this.sopsDir = join(process.cwd(), ".agent", "sops");

    this.setupTools();
  }

  private setupTools() {
    setupBrainTools(this.server, this.episodic, this.semantic, this.sopsDir);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Brain MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new BrainServer();
  server.run().catch((err) => {
    console.error("Fatal error in Brain MCP Server:", err);
    process.exit(1);
  });
}
