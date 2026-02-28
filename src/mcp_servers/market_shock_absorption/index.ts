import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { fileURLToPath } from "url";
import { registerShockAbsorptionTools } from "./tools/shock_absorption.js";

class MarketShockAbsorptionServer {
    public server: McpServer;

    constructor() {
        this.server = new McpServer({
            name: "Market Shock Absorption MCP",
            version: "1.0.0"
        });

        // Register tools
        registerShockAbsorptionTools(this.server);
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
                console.error(`Market Shock Absorption MCP Server running on http://localhost:${port}/sse`);
            });
        } else {
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
            console.error("Market Shock Absorption MCP Server running on stdio");
        }
    }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    const server = new MarketShockAbsorptionServer();
    server.run().catch((err) => {
        console.error("Fatal error in Market Shock Absorption MCP Server:", err);
        process.exit(1);
    });
}

export { MarketShockAbsorptionServer };
