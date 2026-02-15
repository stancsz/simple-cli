import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class LangGraphServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "langgraph-server",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "run_langgraph_agent",
      "Run a LangGraph agent workflow. This tool executes a simple state graph agent that uses an LLM to process the input task.",
      {
        task: z.string().describe("The task or query for the agent to process."),
        model_name: z.string().optional().describe("The OpenAI model to use (default: gpt-4o)."),
      },
      async ({ task, model_name }) => {
        return await this.runAgent(task, model_name);
      }
    );
  }

  async runAgent(task: string, model_name?: string) {
    const scriptPath = join(__dirname, "agent.py");

    // Check dependencies
    const checkDeps = spawn("python3", ["-c", "import langgraph; import langchain_openai"], {
      stdio: "ignore",
    });

    const depsInstalled = await new Promise<boolean>((resolve) => {
      checkDeps.on("exit", (code) => resolve(code === 0));
      checkDeps.on("error", () => resolve(false));
    });

    if (!depsInstalled) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Python dependencies 'langgraph' or 'langchain_openai' are not installed. Please install them using `pip install langgraph langchain_openai`.",
          },
        ],
      };
    }

    const env = {
      ...process.env,
      ...(model_name ? { OPENAI_MODEL_NAME: model_name } : {}),
    };

    return new Promise<any>((resolve, reject) => {
      const pythonProcess = spawn("python3", [scriptPath, task], {
        env,
      });

      let output = "";
      let errorOutput = "";

      pythonProcess.stdout.on("data", (data) => {
        output += data.toString();
      });

      pythonProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      pythonProcess.on("close", (code) => {
        if (code === 0) {
          try {
             // Try to parse the JSON output from the script
             const jsonOutput = JSON.parse(output.trim());
             if (jsonOutput.error) {
                 resolve({
                     content: [{ type: "text" as const, text: `Agent Error: ${jsonOutput.error}` }]
                 });
             } else {
                 resolve({
                     content: [{ type: "text" as const, text: jsonOutput.result }]
                 });
             }
          } catch (e) {
             // Fallback if not JSON
             resolve({
                 content: [{ type: "text" as const, text: output.trim() }]
             });
          }
        } else {
          resolve({
            content: [
              {
                type: "text" as const,
                text: `Agent execution failed (exit code ${code}):\n${errorOutput}\n${output}`,
              },
            ],
          });
        }
      });

      pythonProcess.on("error", (err) => {
        resolve({
          content: [
            {
              type: "text" as const,
              text: `Failed to spawn python process: ${err.message}`,
            },
          ],
        });
      });
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("LangGraph MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new LangGraphServer();
  server.run().catch((err) => {
    console.error("Fatal error in LangGraph MCP Server:", err);
    process.exit(1);
  });
}
