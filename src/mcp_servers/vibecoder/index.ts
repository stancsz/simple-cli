import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { VibecoderFileSystem } from "./file_system.js";
import { Strategist } from "./strategist.js";
import { Architect } from "./architect.js";
import { Builder } from "./builder.js";

class VibecoderServer {
  private server: McpServer;
  private fs: VibecoderFileSystem;
  private strategist: Strategist;
  private architect: Architect;
  private builder: Builder;

  constructor() {
    this.server = new McpServer({
      name: "vibecoder",
      version: "1.0.0",
    });

    this.fs = new VibecoderFileSystem();
    this.strategist = new Strategist();
    this.architect = new Architect();
    this.builder = new Builder();

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "vibecoder_init_project",
      "Initialize the Vibecoder file structure (vibecoder/ dir).",
      {},
      async () => {
        const result = this.fs.initVibecoder();
        return {
          content: [{ type: "text", text: result }],
        };
      }
    );

    this.server.tool(
      "vibecoder_analyze_ref",
      "Analyze a reference repository or path for heuristics.",
      {
        path: z.string().describe("Path to the reference project."),
      },
      async ({ path }) => {
        const heuristics = await this.strategist.analyzeReference(path);
        try {
            const h = JSON.parse(heuristics);
            this.fs.saveReferenceHeuristics(h);
        } catch {}
        return {
          content: [{ type: "text", text: `Analyzed ${path}.\n${heuristics}` }],
        };
      }
    );

    this.server.tool(
      "vibecoder_strategize",
      "Run the Strategist phase (DeepSeek-R1). Can ask questions or generate specs.",
      {
        mode: z.enum(["ask", "generate"]).describe("Mode: 'ask' for questions, 'generate' for specs."),
        context: z.string().optional().describe("User context or answers to previous questions."),
      },
      async ({ mode, context }) => {
        if (mode === "ask") {
          const questions = await this.strategist.askQuestions(context || "Initial Request");
          return {
            content: [{ type: "text", text: questions }],
          };
        } else {
          // Generate Specs
          const refs = JSON.stringify(this.fs.loadReferenceHeuristics());
          const specs = await this.strategist.generateSpecs(context || "No answers provided.", refs);
          this.fs.saveSpecs(specs);
          return {
            content: [{ type: "text", text: `Specs generated and saved to vibecoder/specs.md.\n\n${specs}` }],
          };
        }
      }
    );

    this.server.tool(
      "vibecoder_architect",
      "Run the Architect phase (DeepSeek-R1) to generate the Blueprint.",
      {},
      async () => {
        const specs = this.fs.loadSpecs();
        if (!specs) {
            return {
                content: [{ type: "text", text: "Error: No specs found. Run vibecoder_strategize first." }],
                isError: true
            };
        }
        const blueprint = await this.architect.generateBlueprint(specs);
        this.fs.saveBlueprint(blueprint);
        return {
          content: [{ type: "text", text: `Blueprint generated and saved to vibecoder/blueprint.md.\n\n${blueprint}` }],
        };
      }
    );

    this.server.tool(
      "vibecoder_build",
      "Run the Builder phase (DeepSeek-V3) to implement a file.",
      {
        file_path: z.string().describe("The path of the file to implement."),
      },
      async ({ file_path }) => {
        const specs = this.fs.loadSpecs();
        const blueprint = this.fs.loadBlueprint();
        if (!specs || !blueprint) {
            return {
                content: [{ type: "text", text: "Error: Specs or Blueprint missing." }],
                isError: true
            };
        }

        const code = await this.builder.implementFile(blueprint, file_path, specs);

        return {
          content: [{ type: "text", text: code }],
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Vibecoder MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new VibecoderServer();
  server.run().catch((err) => {
    console.error("Fatal error in Vibecoder MCP Server:", err);
    process.exit(1);
  });
}
