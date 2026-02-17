import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { SOPEngine } from "./sop-engine.js";

export class SOPServer {
    private server: McpServer;
    private engine: SOPEngine;

    constructor() {
        this.server = new McpServer({
            name: "sops",
            version: "1.0.0",
        });

        this.engine = new SOPEngine();
        this.setupTools();
    }

    private setupTools() {
        this.server.tool(
            "list_sops",
            "List all available Standard Operating Procedures (SOPs).",
            {},
            async () => {
                try {
                    const sops = await this.engine.listSOPs();
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(sops, null, 2),
                            },
                        ],
                    };
                } catch (e: any) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Error listing SOPs: ${e.message}` }],
                    };
                }
            }
        );

        this.server.tool(
            "create_sop_from_template",
            "Create a new SOP from a template or topic description.",
            {
                topic: z.string().describe("The topic or goal of the new SOP (e.g., 'Deploy to Production')."),
                template: z.string().optional().describe("Optional template or guidance for the SOP structure."),
            },
            async ({ topic, template }) => {
                try {
                    const filename = await this.engine.createSOP(topic, template);
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Created SOP '${filename}' successfully.`,
                            },
                        ],
                    };
                } catch (e: any) {
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Error creating SOP: ${e.message}` }],
                    };
                }
            }
        );

        this.server.tool(
            "execute_sop",
            "Execute a Standard Operating Procedure (SOP) step-by-step.",
            {
                name: z.string().describe("The name of the SOP to execute (e.g., 'client_onboarding')."),
            },
            async ({ name }) => {
                try {
                    await this.engine.init(); // Ensure client connections
                    const result = await this.engine.executeSOP(name);
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
                        content: [{ type: "text", text: `Error executing SOP: ${e.message}` }],
                    };
                }
            }
        );
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("SOP Server running on stdio");
    }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
    const server = new SOPServer();
    server.run().catch((err) => {
        console.error("Fatal error in SOP Server:", err);
        process.exit(1);
    });
}
