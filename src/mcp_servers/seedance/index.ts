import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";

const API_BASE_URL = "https://api.xskill.ai";
const DEFAULT_MODEL = "st-ai/super-seed2";

// Define Tool Schemas
const CREATE_VIDEO_TASK_TOOL = {
  name: "create_video_task",
  description: "Create a video generation task using Seedance 2.0 (ByteDance AI).",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The prompt for video generation. Supports references like @image1, @video1 if media_files are provided.",
      },
      media_files: {
        type: "array",
        items: { type: "string" },
        description: "List of URLs for images or videos to be used in generation. Required for Image-to-Video tasks, optional for Text-to-Video.",
      },
      aspect_ratio: {
        type: "string",
        description: "Aspect ratio for the generated video (e.g., '16:9', '9:16', '1:1'). Default depends on model.",
      },
      duration: {
        type: "string",
        description: "Duration of the video in seconds (e.g., '5', '10'). Must be a string.",
      },
      speed_mode: {
        type: "string",
        enum: ["Fast", "Standard"],
        description: "Generation speed mode. 'Fast' (default) or 'Standard'. Maps to 'params.model' in the API.",
      },
      negative_prompt: {
        type: "string",
        description: "Negative prompt to specify what to avoid in the generation.",
      },
      model: {
        type: "string",
        description: `The model ID to use. Defaults to '${DEFAULT_MODEL}'.`,
      },
    },
    required: ["prompt"],
  },
};

const QUERY_VIDEO_TASK_TOOL = {
  name: "query_video_task",
  description: "Query the status and result of a video generation task.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The ID of the task to query.",
      },
    },
    required: ["task_id"],
  },
};

export class SeedanceServer {
  private server: Server;
  private apiKey: string;

  constructor() {
    this.server = new Server(
      {
        name: "seedance-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.apiKey = process.env.SEEDANCE_API_KEY || process.env.SUTUI_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: SEEDANCE_API_KEY or SUTUI_API_KEY environment variable is not set. API calls will fail.");
    }

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [CREATE_VIDEO_TASK_TOOL, QUERY_VIDEO_TASK_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  private async handleCallTool(name: string, args: any) {
    if (!this.apiKey) {
      return {
        content: [
          {
            type: "text",
            text: "Error: SEEDANCE_API_KEY or SUTUI_API_KEY environment variable is not set.",
          },
        ],
        isError: true,
      };
    }

    try {
      if (name === "create_video_task") {
        return await this.createVideoTask(args);
      }
      if (name === "query_video_task") {
        return await this.queryVideoTask(args);
      }
      throw new Error(`Tool not found: ${name}`);
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
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
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private async queryVideoTask(args: any) {
    const { task_id } = args;

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
          type: "text",
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
