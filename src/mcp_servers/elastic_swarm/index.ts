import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { ScalingEngine } from "./scaling_engine.js";
import { join } from "path";
import { fileURLToPath } from "url";

const server = new McpServer({
    name: "elastic-swarm",
    version: "1.0.0"
});

// Add tool to manually trigger scaling or get status
server.tool("get_scaling_status", "Get current scaling engine status", {}, async () => {
    // Return internal state (not easily accessible unless passed or shared)
    return { content: [{ type: "text", text: "Running" }] };
});

const AGENT_DIR = process.env.AGENT_DIR || join(process.cwd(), '.agent');
const SWARM_URL = process.env.SWARM_URL;

const engine = new ScalingEngine(AGENT_DIR, SWARM_URL);

async function main() {
    engine.start();
    await engine.connect();

    if (process.env.PORT) {
        const port = parseInt(process.env.PORT, 10);
        const app = express();
        const transport = new StreamableHTTPServerTransport();
        await server.connect(transport);

        app.all("/sse", async (req, res) => {
          await transport.handleRequest(req, res);
        });

        app.post("/messages", async (req, res) => {
          await transport.handleRequest(req, res);
        });

        app.get("/health", (req, res) => {
          res.sendStatus(200);
        });

        app.listen(port, () => {
          console.error(`Elastic Swarm MCP Server running on http://localhost:${port}/sse`);
        });
    } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Elastic Swarm MCP Server running on stdio");
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error("Fatal error:", err);
        process.exit(1);
    });
}
