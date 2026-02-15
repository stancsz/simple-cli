import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

const API_BASE_URL = "https://api.xskill.ai";
const DEFAULT_MODEL = "st-ai/super-seed2";

export class SeedanceServer {
  private server: McpServer;
  private apiKey: string;

  constructor() {
    this.server = new McpServer({
      name: "seedance-server",
      version: "1.0.0",
    });

    this.apiKey = process.env.SEEDANCE_API_KEY || process.env.SUTUI_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: SEEDANCE_API_KEY or SUTUI_API_KEY environment variable is not set. API calls will fail.");
    }

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "create_video_task",
      "Create a video generation task using Seedance 2.0 (ByteDance AI).",
      {
        prompt: z.string().describe("The prompt for video generation. Supports references like @image1, @video1 if media_files are provided."),
        media_files: z.array(z.string()).optional().describe("List of URLs for images or videos to be used in generation. Required for Image-to-Video tasks, optional for Text-to-Video."),
        aspect_ratio: z.string().optional().describe("Aspect ratio for the generated video (e.g., '16:9', '9:16', '1:1'). Default depends on model."),
        duration: z.string().optional().describe("Duration of the video in seconds (e.g., '5', '10'). Must be a string."),
        speed_mode: z.enum(["Fast", "Standard"]).optional().describe("Generation speed mode. 'Fast' (default) or 'Standard'. Maps to 'params.model' in the API."),
        negative_prompt: z.string().optional().describe("Negative prompt to specify what to avoid in the generation."),
        model: z.string().optional().describe(`The model ID to use. Defaults to '${DEFAULT_MODEL}'.`),
      },
      async (args) => {
        if (!this.apiKey) {
            return {
                content: [{ type: "text" as const, text: "Error: SEEDANCE_API_KEY or SUTUI_API_KEY environment variable is not set." }],
                isError: true,
            };
        }
        return await this.createVideoTask(args);
      }
    );

    this.server.tool(
      "query_video_task",
      "Query the status and result of a video generation task.",
      {
        task_id: z.string().describe("The ID of the task to query."),
      },
      async ({ task_id }) => {
        if (!this.apiKey) {
            return {
                content: [{ type: "text" as const, text: "Error: SEEDANCE_API_KEY or SUTUI_API_KEY environment variable is not set." }],
                isError: true,
            };
        }
        return await this.queryVideoTask(task_id);
      }
    );
  }

  private async createVideoTask(args: any) {
    const { prompt, media_files, aspect_ratio, duration, negative_prompt, model, speed_mode } = args;

    const payload = {
      model: model || DEFAULT_MODEL,
      params: {
        prompt,
        media_files,
        aspect_ratio,
        duration: duration ? String(duration) : undefined,
        negative_prompt,
        model: speed_mode, // Maps speed_mode to params.model
      },
      channel: null,
    };

    const response = await fetch(`${API_BASE_URL}/api/v3/tasks/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async queryVideoTask(task_id: string) {
    const response = await fetch(`${API_BASE_URL}/api/v3/tasks/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ task_id }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Seedance MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SeedanceServer();
  server.run().catch((err) => {
    console.error("Fatal error in Seedance MCP Server:", err);
    process.exit(1);
  });
}
