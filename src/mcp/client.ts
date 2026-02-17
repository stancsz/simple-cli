import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "fs";

export class McpClient {
    private client: Client | null = null;
    private serverScript: string;
    private name: string;

    constructor(name: string, serverScriptPath: string) {
        this.name = name;
        this.serverScript = serverScriptPath;
    }

    async connect() {
        if (this.client) return;

        if (!existsSync(this.serverScript)) {
             console.warn(`[McpClient] Server script not found at ${this.serverScript}`);
             return;
        }

        const isTs = this.serverScript.endsWith(".ts");
        const command = isTs ? "npx" : "node";
        const args = isTs ? ["tsx", this.serverScript] : [this.serverScript];

        try {
            const transport = new StdioClientTransport({
                command,
                args,
                env: process.env as any
            });

            this.client = new Client(
                { name: `${this.name}-client`, version: "1.0.0" },
                { capabilities: {} }
            );

            await this.client.connect(transport);
        } catch (e) {
            console.error(`[McpClient] Failed to connect to ${this.name}:`, e);
            this.client = null;
        }
    }

    async callTool(name: string, args: any) {
        if (!this.client) await this.connect();
        if (!this.client) throw new Error(`Client for ${this.name} not connected.`);

        return await this.client.callTool({
            name,
            arguments: args
        });
    }

    async close() {
        if (this.client) {
            await this.client.close();
            this.client = null;
        }
    }
}
