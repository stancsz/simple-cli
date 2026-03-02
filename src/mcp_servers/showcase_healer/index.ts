import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { createLLM } from "../../llm/index.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { MCP } from "../../mcp.js";
import { healShowcase } from "./healer.js";

class ShowcaseHealerServer {
    private server: McpServer;
    private mcp: MCP;
    private llm: ReturnType<typeof createLLM>;
    private episodic: EpisodicMemory;

    constructor() {
        this.server = new McpServer({
            name: "showcase_healer",
            version: "1.0.0"
        });
        this.mcp = new MCP();
        this.llm = createLLM();
        this.episodic = new EpisodicMemory();

        this.setupTools();
    }

    private setupTools() {
        this.server.tool(
            "heal_showcase",
            "Analyze latest showcase run and apply fixes if needed.",
            {
                run_id: z.string().optional().describe("Optional run ID to heal (defaults to latest).")
            },
            async ({ run_id }) => {
                try {
                    // Ensure MCP clients are ready
                    // We re-init to pick up any config changes, though likely already initted
                    // MCP.init() handles idempotency somewhat but loading config again
                    await this.mcp.init();

                    // Start required servers if not running
                    // Note: startServer checks if already running
                    try {
                        if (!this.mcp.isServerRunning("health_monitor")) {
                            await this.mcp.startServer("health_monitor");
                        }
                    } catch (e) {
                        console.error("Failed to start health_monitor:", e);
                    }
                    try {
                         if (!this.mcp.isServerRunning("sop_engine")) {
                            await this.mcp.startServer("sop_engine");
                        }
                    } catch (e) {
                        console.error("Failed to start sop_engine:", e);
                    }
                    try {
                         if (!this.mcp.isServerRunning("brain")) {
                            await this.mcp.startServer("brain");
                        }
                    } catch (e) {
                        console.error("Failed to start brain:", e);
                    }
                    try {
                         if (!this.mcp.isServerRunning("scheduler")) {
                            await this.mcp.startServer("scheduler");
                        }
                    } catch (e) {
                        console.error("Failed to start scheduler:", e);
                    }

                    const mcpAdapter = {
                        callTool: async (serverName: string, toolName: string, args: any) => {
                            const client = this.mcp.getClient(serverName);
                            if (!client) {
                                throw new Error(`Server '${serverName}' is not connected.`);
                            }
                            return await client.callTool({ name: toolName, arguments: args });
                        }
                    };

                    const result = await healShowcase({
                        mcp: mcpAdapter,
                        llm: this.llm,
                        episodic: this.episodic
                    });

                    return { content: [{ type: "text", text: result }] };
                } catch (e: any) {
                    return {
                        content: [{ type: "text", text: `Healing failed: ${e.message}` }],
                        isError: true
                    };
                }
            }
        );
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Showcase Healer Server running on stdio");
    }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    const server = new ShowcaseHealerServer();
    server.run().catch((err) => {
        console.error("Fatal error in Showcase Healer Server:", err);
        process.exit(1);
    });
}
