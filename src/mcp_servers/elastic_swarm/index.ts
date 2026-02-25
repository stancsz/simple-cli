import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import { registerTools } from "./tools.js";
import { startDemandMonitor } from "./demand_monitor.js";
import { ScalerEngine } from "./scaler_engine.js";

// Load secrets from .env.agent
const envPath = join(process.cwd(), ".env.agent");
if (existsSync(envPath)) {
  config({ path: envPath });
}

export class ElasticSwarmServer {
    private server: McpServer;
    private scalerEngine: ScalerEngine;

    constructor() {
        this.server = new McpServer({
            name: "elastic_swarm",
            version: "1.0.0",
        });
        this.scalerEngine = new ScalerEngine();
        registerTools(this.server, this.scalerEngine);
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Elastic Swarm MCP Server running on stdio");

        // Initialize Scaler Engine (load state)
        await this.scalerEngine.init();

        // Start Demand Monitor
        await startDemandMonitor(this.scalerEngine);
    }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    const server = new ElasticSwarmServer();
    server.run().catch((error) => {
      console.error("Server error:", error);
      process.exit(1);
    });
}
