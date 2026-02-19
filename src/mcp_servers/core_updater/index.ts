import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "url";
import { resolve } from "path";

import { ProposeCoreUpdateSchema, ApplyCoreUpdateSchema } from "./schema.js";
import { CoreProposalStorage } from "./storage.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { proposeCoreUpdate } from "./tools/propose_core_update.js";
import { applyCoreUpdate } from "./tools/apply_core_update.js";

export class CoreUpdaterServer {
  private server: McpServer;
  private storage: CoreProposalStorage;
  private memory: EpisodicMemory;
  private rootDir: string;

  constructor(rootDir: string = process.cwd()) {
    this.rootDir = resolve(rootDir);
    this.storage = new CoreProposalStorage(rootDir);
    this.memory = new EpisodicMemory(rootDir);
    this.server = new McpServer({
      name: "core_updater",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "propose_core_update",
      "Propose a change to a core file in src/. Creates a proposal that requires approval.",
      {
        description: ProposeCoreUpdateSchema.shape.description,
        file_path: ProposeCoreUpdateSchema.shape.file_path,
        new_content: ProposeCoreUpdateSchema.shape.new_content,
        reasoning: ProposeCoreUpdateSchema.shape.reasoning,
      },
      async (args) => proposeCoreUpdate(args, this.storage, this.memory, this.rootDir)
    );

    this.server.tool(
      "apply_core_update",
      "Apply a pending core update. Requires approval token or YOLO mode.",
      {
        proposal_id: ApplyCoreUpdateSchema.shape.proposal_id,
        approval_token: ApplyCoreUpdateSchema.shape.approval_token,
      },
      async (args) => applyCoreUpdate(args, this.storage, this.memory, this.rootDir)
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Core Updater MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new CoreUpdaterServer();
  server.run().catch((err) => {
    console.error("Fatal error in Core Updater MCP Server:", err);
    process.exit(1);
  });
}
