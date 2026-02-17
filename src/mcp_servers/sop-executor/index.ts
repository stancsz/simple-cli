import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { SOPExecutor } from "./executor.js";

export class SOPExecutorServer {
    private server: McpServer;
    private executor: SOPExecutor;

    constructor() {
        this.server = new McpServer({
            name: "sop-executor",
            version: "1.0.0",
        });

        this.executor = new SOPExecutor();
        this.setupTools();
    }

    private setupTools() {
        this.server.tool(
            "sop_load",
            "Load and parse an SOP markdown file.",
            {
                path: z.string().describe("Path to the SOP markdown file (e.g., 'market_research.md')"),
            },
            async ({ path }) => {
                try {
                    const sop = await this.executor.loadSOP(path);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(sop, null, 2),
                            },
                        ],
                    };
                } catch (e: any) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Error loading SOP: ${e.message}` }],
                    };
                }
            }
        );

        this.server.tool(
            "sop_execute_step",
            "Execute a single step of an SOP.",
            {
                name: z.string().describe("Name of the SOP to execute (e.g., 'market_research')"),
            },
            async ({ name }) => {
                try {
                    await this.executor.init(); // Ensure client is connected
                    const result = await this.executor.executeStep(name);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                } catch (e: any) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Error executing SOP step: ${e.message}` }],
                    };
                }
            }
        );

        this.server.tool(
            "sop_run",
            "Execute an entire SOP from start to finish.",
            {
                name: z.string().describe("Name of the SOP to execute (e.g., 'market_research')"),
            },
            async ({ name }) => {
                try {
                    await this.executor.init(); // Ensure client is connected
                    const result = await this.executor.run(name);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(result, null, 2),
                            },
                        ],
                    };
                } catch (e: any) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Error running SOP: ${e.message}` }],
                    };
                }
            }
        );
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("SOP Executor Server running on stdio");
    }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    const server = new SOPExecutorServer();
    server.run().catch((err) => {
        console.error("Fatal error in SOP Executor Server:", err);
        process.exit(1);
    });
}
