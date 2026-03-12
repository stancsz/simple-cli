import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { fileURLToPath } from "url";
import { EpisodicMemory } from "../../brain/episodic.js";
import { dirname } from "path";
import { registerLedgerTools } from "./tools.js";

export class DistributedLedgerServer {
  private server: McpServer;
  private episodic: EpisodicMemory;

  constructor() {
    this.server = new McpServer({
      name: "distributed_ledger",
      version: "1.0.0",
    });

    const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
    this.episodic = new EpisodicMemory(baseDir);

    // Register tools
    registerLedgerTools(this.server, this.episodic);
  }

  async run() {
    if (process.env.PORT) {
      const app = express();
      const transport = new StreamableHTTPServerTransport();
      await this.server.connect(transport);

      app.all("/sse", async (req, res) => {
        await transport.handleRequest(req, res);
      });

      app.post("/messages", async (req, res) => {
        await transport.handleRequest(req, res);
      });

      app.get("/health", (req, res) => {
        res.sendStatus(200);
      });

      const port = process.env.PORT;
      app.listen(port, () => {
        console.error(`Distributed Ledger MCP Server running on http://localhost:${port}/sse`);
      });
    } else {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Distributed Ledger MCP Server running on stdio");
    }
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new DistributedLedgerServer();
  server.run().catch((err) => {
    console.error("Fatal error in Distributed Ledger MCP Server:", err);
    process.exit(1);
  });
}
