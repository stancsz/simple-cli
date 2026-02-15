import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const execFileAsync = promisify(execFile);

export class LlamaFactoryServer {
  private server: McpServer;
  private cliPath: string;

  constructor() {
    this.server = new McpServer({
      name: "llama-factory-server",
      version: "1.0.0",
    });
    this.cliPath = process.env.LLAMA_FACTORY_CLI_PATH || "llamafactory-cli";
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "llama_train",
      "Start a training job using LLaMA-Factory.",
      {
        config: z.record(z.any()).describe("Training configuration (JSON object)."),
      },
      async ({ config }) => {
        let tmpDir: string | undefined;
        try {
           tmpDir = await mkdtemp(join(tmpdir(), "llama-factory-"));
           const configPath = join(tmpDir, "train_config.json");

           await writeFile(configPath, JSON.stringify(config, null, 2));

           const args = ["train", configPath];

           const { stdout, stderr } = await execFileAsync(this.cliPath, args);
           return {
             content: [{ type: "text" as const, text: stdout + (stderr ? `\nStderr: ${stderr}` : "") }],
           };
        } catch (error: any) {
             return {
            content: [{ type: "text" as const, text: `Error: ${error.message}\n${error.stderr || ""}` }],
            isError: true,
          };
        } finally {
            if (tmpDir) {
                await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
            }
        }
      }
    );

    this.server.tool(
        "llama_export",
        "Export a fine-tuned model.",
        {
            model_name_or_path: z.string().describe("Path to the model."),
            output_dir: z.string().describe("Directory to export to."),
            template: z.string().optional().describe("Template to use."),
        },
        async ({ model_name_or_path, output_dir, template }) => {
             const args = ["export", "--model_name_or_path", model_name_or_path, "--output_dir", output_dir];
             if (template) {
                 args.push("--template", template);
             }

             try {
                const { stdout, stderr } = await execFileAsync(this.cliPath, args);
                return {
                    content: [{ type: "text" as const, text: stdout + (stderr ? `\nStderr: ${stderr}` : "") }],
                };
             } catch (error: any) {
                 return {
                    content: [{ type: "text" as const, text: `Error: ${error.message}\n${error.stderr || ""}` }],
                    isError: true,
                };
             }
        }
    )
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("LLaMA-Factory MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new LlamaFactoryServer().run().catch((error) => {
    console.error("Fatal error in LLaMA-Factory MCP Server:", error);
    process.exit(1);
  });
}
