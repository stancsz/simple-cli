import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export class AutoAgentServer {
  private server: McpServer;
  private cliPath: string;

  constructor() {
    this.server = new McpServer({
      name: "autoagent-server",
      version: "1.0.0",
    });
    this.cliPath = process.env.AUTOAGENT_CLI_PATH || "autoagent";
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "autoagent_create_agent",
      "Create a new agent using AutoAgent CLI.",
      {
        name: z.string().describe("Name of the agent."),
        description: z.string().describe("Description of what the agent should do."),
        llm: z.string().describe("LLM to use (e.g., deepseek:deepseek-reasoner)."),
        tools: z.array(z.string()).describe("List of tools to give to the agent."),
      },
      async ({ name, description, llm, tools }) => {
        const toolsStr = tools.join(",");
        const args = ["create", "--name", name, "--description", description, "--llm", llm, "--tools", toolsStr];

        // Configure environment for DeepSeek if available
        const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
        const env = {
          ...process.env,
          OPENAI_API_KEY: apiKey,
          ...(process.env.DEEPSEEK_API_KEY
            ? {
              OPENAI_BASE_URL: "https://api.deepseek.com",
              // We don't default the model here because it's passed as an argument, but we provide the base URL
            }
            : {}),
        };

        try {
          const { stdout, stderr } = await execFileAsync(this.cliPath, args, { env });
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
    );

    this.server.tool(
      "autoagent_run_agent",
      "Run an existing agent.",
      {
        name: z.string().describe("Name of the agent to run."),
        task: z.string().describe("The task to perform."),
      },
      async ({ name, task }) => {
        const args = ["run", "--name", name, "--task", task];
        // Configure environment for DeepSeek if available
        const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
        const env = {
          ...process.env,
          OPENAI_API_KEY: apiKey,
          ...(process.env.DEEPSEEK_API_KEY
            ? {
              OPENAI_BASE_URL: "https://api.deepseek.com",
            }
            : {}),
        };
        try {
          const { stdout, stderr } = await execFileAsync(this.cliPath, args, { env });
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
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("AutoAgent MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new AutoAgentServer().run().catch((error) => {
    console.error("Fatal error in AutoAgent MCP Server:", error);
    process.exit(1);
  });
}
