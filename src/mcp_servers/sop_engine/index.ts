import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { join } from "path";
import { readdir, readFile, writeFile } from "fs/promises";
import { existsSync, mkdirSync } from "fs";
import { createLLM } from "../../llm.js";
import { MCP } from "../../mcp.js";
import { parseSOP } from "./sop_parser.js";
import { SOPExecutor } from "./executor.js";
import { fileURLToPath } from "url";

export class SOPEngineServer {
  private server: McpServer;
  private sopDirs: string[];

  constructor() {
    this.server = new McpServer({
      name: "sop_engine",
      version: "1.0.0",
    });

    // Check both docs/sops (primary) and sops/ (secondary)
    this.sopDirs = [
      process.env.JULES_SOP_DIR || join(process.cwd(), "docs", "sops"),
      join(process.cwd(), "sops")
    ];

    // Ensure at least the primary directory exists
    if (!existsSync(this.sopDirs[0])) {
      mkdirSync(this.sopDirs[0], { recursive: true });
    }

    this.setupTools();
  }

  private async findSopPath(name: string): Promise<string | null> {
    const safeName = name.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    const filename = safeName.endsWith(".md") ? safeName : `${safeName}.md`;

    for (const dir of this.sopDirs) {
      if (existsSync(dir)) {
        const filePath = join(dir, filename);
        if (existsSync(filePath)) {
           // Security check: ensure file is within dir
           if (filePath.startsWith(dir)) return filePath;
        }
      }
    }
    return null;
  }

  private setupTools() {
    this.server.tool(
      "sop_list",
      "List available Standard Operating Procedures (SOPs).",
      {},
      async () => {
        try {
          const allSops = new Set<string>();
          for (const dir of this.sopDirs) {
            if (existsSync(dir)) {
                const files = await readdir(dir);
                files.filter(f => f.endsWith(".md")).forEach(f => allSops.add(f.replace(".md", "")));
            }
          }

          if (allSops.size === 0) {
             return { content: [{ type: "text", text: "No SOPs found." }] };
          }

          return {
            content: [{ type: "text", text: Array.from(allSops).join(", ") }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error listing SOPs: ${e.message}` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      "validate_sop",
      "Validate a Standard Operating Procedure (SOP) file.",
      {
        name: z.string().describe("The name of the SOP to validate."),
      },
      async ({ name }) => {
        const filePath = await this.findSopPath(name);

        if (!filePath) {
          return {
            content: [{ type: "text", text: `SOP '${name}' not found.` }],
            isError: true
          };
        }

        try {
            const content = await readFile(filePath, "utf-8");
            const sop = parseSOP(content);

            if (!sop.title) throw new Error("Missing title (first line must be '# Title')");
            if (sop.steps.length === 0) throw new Error("No steps found (numbered list required)");

            return {
                content: [{ type: "text", text: `SOP '${name}' is valid.\nTitle: ${sop.title}\nSteps: ${sop.steps.length}` }]
            };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `SOP Invalid: ${e.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "sop_execute",
      "Execute a Standard Operating Procedure (SOP) step-by-step.",
      {
        name: z.string().describe("The name of the SOP to execute (e.g., 'market_research')."),
        input: z.string().describe("The input or context for the SOP execution.")
      },
      async ({ name, input }) => {
        const filePath = await this.findSopPath(name);

        if (!filePath) {
          return {
            content: [{ type: "text", text: `SOP '${name}' not found.` }],
            isError: true
          };
        }

        try {
          const content = await readFile(filePath, "utf-8");
          const sop = parseSOP(content);

          const llm = createLLM();
          const mcp = new MCP();
          // Initialize MCP happens inside executor.execute()

          const executor = new SOPExecutor(llm, mcp);
          const result = await executor.execute(sop, input);

          return {
            content: [{ type: "text", text: result }]
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error executing SOP '${name}': ${e.message}` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      "sop_create",
      "Create a new Standard Operating Procedure (SOP).",
      {
        name: z.string().describe("The name of the SOP (e.g., 'deployment_guide')."),
        content: z.string().describe("The Markdown content of the SOP.")
      },
      async ({ name, content }) => {
        const safeName = name.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
        const filename = safeName.endsWith(".md") ? safeName : `${safeName}.md`;
        // Always create in primary directory
        const filePath = join(this.sopDirs[0], filename);

        // Security check
        if (!filePath.startsWith(this.sopDirs[0])) {
          return {
            content: [{ type: "text", text: "Invalid SOP name." }],
            isError: true
          };
        }

        try {
          await writeFile(filePath, content, "utf-8");
          return {
            content: [{ type: "text", text: `SOP '${name}' created successfully in ${this.sopDirs[0]}.` }]
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Error creating SOP: ${e.message}` }],
            isError: true
          };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SOP Engine Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SOPEngineServer();
  server.run().catch((err) => {
    console.error("Fatal error in SOP Engine Server:", err);
    process.exit(1);
  });
}
