import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import simpleGit from "simple-git";

const server = new McpServer({ name: "git", version: "1.0.0" });
const git = simpleGit();

server.tool("git_commit", "Git commit", { message: z.string() }, async ({ message }) => {
    try {
        await git.add(".");
        const res = await git.commit(message);
        return { content: [{ type: "text", text: `Committed ${res.commit}: ${res.summary.total} files changed.` }] };
    } catch(e: any) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
});

server.tool("git_log", "Git log", { max: z.number().optional() }, async ({ max = 10 }) => {
    try {
        const log = await git.log({ maxCount: max });
        return { content: [{ type: "text", text: JSON.stringify(log.all, null, 2) }] };
    } catch(e: any) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Git MCP Server running on stdio");
}

main().catch(console.error);
