import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "path";
import { existsSync } from "fs";

// Helper to check a server
async function checkServer(serverName: string, expectedTools: string[]) {
    const serverScript = join(
        process.cwd(),
        `src/mcp_servers/${serverName}/index.ts`,
    );

    if (!existsSync(serverScript)) {
        throw new Error(`Server script not found: ${serverScript}`);
    }

    const transport = new StdioClientTransport({
        command: "npx",
        args: ["tsx", serverScript],
        env: process.env, // Pass current env for any API keys
    });

    const client = new Client(
        { name: "test-client", version: "1.0.0" },
        { capabilities: {} },
    );

    try {
        await client.connect(transport);
        const tools = await client.listTools();
        const toolNames = tools.tools.map((t) => t.name);

        for (const tool of expectedTools) {
            expect(toolNames).toContain(tool);
        }
    } finally {
        await transport.close();
    }
}

describe("New MCP Servers Verification", () => {
    it("PydanticAI Server should list tools", async () => {
        await checkServer("pydanticai", ["pydantic_extract"]);
    }, 30000);

    it("Agno Server should list tools", async () => {
        await checkServer("agno", ["agno_chat"]);
    }, 30000);

    it("Devin Server should list tools", async () => {
        await checkServer("devin", ["devin_create_session", "devin_get_session", "devin_list_sessions"]);
    }, 30000);
});
