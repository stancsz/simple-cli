import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { z } from "zod";

const execAsync = promisify(exec);

const JulesTaskSchema = z.object({
  task: z.string().describe("The task description."),
  context_files: z
    .array(z.string())
    .optional()
    .describe("List of file paths to provide as context."),
});

export const JULES_TASK_TOOL = {
  name: "jules_task",
  description:
    "Delegate a coding task to the Jules agent (Google Cloud). Jules will attempt to create a Pull Request.",
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "The task description.",
      },
      context_files: {
        type: "array",
        items: {
          type: "string",
        },
        description: "List of file paths to provide as context.",
      },
    },
    required: ["task"],
  },
};

interface JulesTaskResult {
  success: boolean;
  prUrl?: string;
  message: string;
}

interface Source {
  name: string;
  id: string;
  githubRepo: {
    owner: string;
    repo: string;
  };
}

export class JulesClient {
  private apiBaseUrl: string;
  private apiKey?: string;

  constructor(config: { apiKey?: string; apiBaseUrl?: string } = {}) {
    this.apiKey = config.apiKey || process.env.JULES_API_KEY;
    this.apiBaseUrl =
      config.apiBaseUrl || "https://jules.googleapis.com/v1alpha";
  }

  private async getRepoInfo(): Promise<{
    owner: string;
    repo: string;
    branch: string;
  }> {
    try {
      const { stdout: remoteUrl } = await execAsync(
        "git remote get-url origin",
      );
      let owner = "",
        repo = "";
      const cleanUrl = remoteUrl.trim().replace(/\.git$/, "");

      if (cleanUrl.startsWith("http")) {
        const parts = cleanUrl.split("/");
        owner = parts[parts.length - 2];
        repo = parts[parts.length - 1];
      } else if (cleanUrl.includes(":")) {
        const parts = cleanUrl.split(":");
        const path = parts[1].split("/");
        owner = path[0];
        repo = path[1];
      }

      const { stdout: branch } = await execAsync(
        "git rev-parse --abbrev-ref HEAD",
      );
      return { owner, repo, branch: branch.trim() };
    } catch (e) {
      console.error(
        "[JulesClient] Could not detect git repo info locally. Falling back to defaults.",
      );
      return { owner: "stancsz", repo: "simple-cli", branch: "main" };
    }
  }

  private async listSources(): Promise<Source[]> {
    const url = `${this.apiBaseUrl}/sources`;
    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": this.apiKey || "",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to list sources: ${response.status} ${response.statusText} - ${await response.text()}`,
      );
    }
    const data: any = await response.json();
    return data.sources || [];
  }

  private async createSession(
    sourceName: string,
    prompt: string,
    branch: string,
  ) {
    const url = `${this.apiBaseUrl}/sessions`;
    const body = {
      prompt,
      sourceContext: {
        source: sourceName,
        githubRepoContext: {
          startingBranch: branch,
        },
      },
      automationMode: "AUTO_CREATE_PR",
      title: `Task: ${prompt.substring(0, 30)}...`,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey || "",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create session: ${response.status} ${response.statusText} - ${await response.text()}`,
      );
    }
    return await response.json();
  }

  private async getSession(sessionId: string) {
    const url = sessionId.startsWith("sessions/")
      ? `${this.apiBaseUrl}/${sessionId}`
      : `${this.apiBaseUrl}/sessions/${sessionId}`;

    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": this.apiKey || "",
      },
    });
    if (!response.ok) {
      throw new Error(
        `Failed to get session: ${response.status} ${response.statusText}`,
      );
    }
    return await response.json();
  }

  async executeTask(
    task: string,
    contextFiles: string[] = [],
  ): Promise<JulesTaskResult> {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          message: "JULES_API_KEY not set. Cannot call Jules API.",
        };
      }

      console.error(`[JulesClient] Detecting repository...`);
      const { owner, repo, branch } = await this.getRepoInfo();
      console.error(
        `[JulesClient] Target: ${owner}/${repo} on branch ${branch}`,
      );

      console.error(`[JulesClient] Finding source in Jules...`);
      const sources = await this.listSources();
      const source = sources.find(
        (s) => s.githubRepo.owner === owner && s.githubRepo.repo === repo,
      );

      if (!source) {
        return {
          success: false,
          message: `Repository ${owner}/${repo} not found in your Jules sources. Please connect it first.`,
        };
      }
      console.error(`[JulesClient] Found source: ${source.name}`);

      let prompt = task;
      if (contextFiles.length > 0) {
        prompt += `\n\nContext Files: ${contextFiles.join(", ")} (Please read these if needed)`;
      }

      console.error(`[JulesClient] Creating session for task: "${task}"...`);
      const session = await this.createSession(source.name, prompt, branch);
      console.error(`[JulesClient] Session created: ${session.name}`);

      console.error(`[JulesClient] Polling for Pull Request (timeout 5m)...`);
      const startTime = Date.now();
      while (Date.now() - startTime < 300000) {
        const updatedSession: any = await this.getSession(session.name);

        if (updatedSession.outputs && updatedSession.outputs.length > 0) {
          for (const output of updatedSession.outputs) {
            if (output.pullRequest) {
              return {
                success: true,
                prUrl: output.pullRequest.url,
                message: `Jules created PR: ${output.pullRequest.url}`,
              };
            }
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
        // process.stdout.write("."); // Avoid writing to stdout in MCP server (use stderr for logs)
      }

      return {
        success: false,
        message:
          "Timeout waiting for Jules to create a PR. Session is still active: " +
          session.name,
      };
    } catch (error: any) {
      console.error(`[JulesClient] Error executing task:`, error);
      return {
        success: false,
        message: `Jules API Task failed: ${error.message}`,
      };
    }
  }
}

export class JulesServer {
  private server: Server;
  private client: JulesClient;

  constructor() {
    this.server = new Server(
      {
        name: "jules-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    this.client = new JulesClient();
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [JULES_TASK_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  public async handleCallTool(name: string, args: any) {
    if (name === "jules_task") {
      const parsed = JulesTaskSchema.safeParse(args);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidParams, parsed.error.message);
      }

      const { task, context_files } = parsed.data;

      try {
        const result = await this.client.executeTask(
          task,
          context_files || [],
        );

        if (result.success) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  status: "success",
                  pr_url: result.prUrl,
                  message: result.message,
                }),
              },
            ],
          };
        } else {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${result.message}`,
              },
            ],
            isError: true,
          };
        }
      } catch (e: any) {
        throw new McpError(
            ErrorCode.InternalError,
            `Jules Client error: ${e.message}`
        );
      }
    }
    throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Jules MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new JulesServer();
  server.run().catch((err) => {
    console.error("Fatal error in Jules MCP Server:", err);
    process.exit(1);
  });
}
