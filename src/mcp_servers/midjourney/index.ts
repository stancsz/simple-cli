import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";

// Tool definitions
const MIDJOURNEY_IMAGINE_TOOL = {
  name: "midjourney_imagine",
  description: "Generate an image from a prompt using Midjourney.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "The prompt to generate an image from.",
      },
      aspect_ratio: {
        type: "string",
        description: "Aspect ratio for the image (e.g., '16:9', '1:1').",
      },
      process_mode: {
        type: "string",
        description: "Process mode: 'fast', 'relax', or 'turbo'.",
      },
      webhook_url: {
        type: "string",
        description: "Optional webhook URL for task updates.",
      },
    },
    required: ["prompt"],
  },
};

const MIDJOURNEY_UPSCALE_TOOL = {
  name: "midjourney_upscale",
  description: "Upscale a generated image (U1-U4).",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The ID of the task containing the image to upscale.",
      },
      index: {
        type: "number",
        description: "The index of the image to upscale (1-4).",
      },
    },
    required: ["task_id", "index"],
  },
};

const MIDJOURNEY_VARIATION_TOOL = {
  name: "midjourney_variation",
  description: "Create a variation of a generated image (V1-V4).",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The ID of the task containing the image to create a variation of.",
      },
      index: {
        type: "number",
        description: "The index of the image to vary (1-4).",
      },
    },
    required: ["task_id", "index"],
  },
};

const MIDJOURNEY_DESCRIBE_TOOL = {
  name: "midjourney_describe",
  description: "Describe an image from a URL.",
  inputSchema: {
    type: "object",
    properties: {
      image_url: {
        type: "string",
        description: "The URL of the image to describe.",
      },
    },
    required: ["image_url"],
  },
};

const MIDJOURNEY_BLEND_TOOL = {
  name: "midjourney_blend",
  description: "Blend multiple images together.",
  inputSchema: {
    type: "object",
    properties: {
      image_urls: {
        type: "array",
        items: {
          type: "string",
        },
        description: "List of image URLs to blend.",
      },
      dimensions: {
        type: "string",
        description: "Dimensions: 'SQUARE', 'PORTRAIT', or 'LANDSCAPE'.",
      },
    },
    required: ["image_urls"],
  },
};

const MIDJOURNEY_FACE_SWAP_TOOL = {
  name: "midjourney_face_swap",
  description: "Swap face from source image to target image.",
  inputSchema: {
    type: "object",
    properties: {
      source_url: {
        type: "string",
        description: "URL of the source image (face provider).",
      },
      target_url: {
        type: "string",
        description: "URL of the target image (face receiver).",
      },
    },
    required: ["source_url", "target_url"],
  },
};

const MIDJOURNEY_STATUS_TOOL = {
  name: "midjourney_status",
  description: "Check the status of a Midjourney task.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: {
        type: "string",
        description: "The ID of the task to check.",
      },
    },
    required: ["task_id"],
  },
};

export class MidjourneyServer {
  private server: Server;
  private apiUrl: string;
  private apiKey: string | undefined;

  constructor() {
    this.server = new Server(
      {
        name: "midjourney-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Default to a placeholder, but allow override
    // Note: User must provide a valid provider URL compatible with standard wrappers if not using the default.
    this.apiUrl =
      process.env.MIDJOURNEY_API_URL || "https://api.userapi.ai/midjourney/v2";
    this.apiKey = process.env.MIDJOURNEY_API_KEY;

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        MIDJOURNEY_IMAGINE_TOOL,
        MIDJOURNEY_UPSCALE_TOOL,
        MIDJOURNEY_VARIATION_TOOL,
        MIDJOURNEY_DESCRIBE_TOOL,
        MIDJOURNEY_BLEND_TOOL,
        MIDJOURNEY_FACE_SWAP_TOOL,
        MIDJOURNEY_STATUS_TOOL,
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  private async callApi(endpoint: string, method: string, body?: any) {
    if (!this.apiKey) {
      throw new Error("MIDJOURNEY_API_KEY environment variable is not set.");
    }

    const url = `${this.apiUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      "api-key": this.apiKey, // Common header for many wrappers
      // Some wrappers might use Authorization: Bearer <token>
      // We'll try both or standard "api-key" if generic.
      // If user sets MIDJOURNEY_API_KEY, we assume it's the right format.
      // Actually, many use "api-key" or "Authorization".
      // Let's check environment variable for header name if needed, but defaulting to api-key is safer for now.
      // Better yet, let's try to detect or just send both if safe, or rely on a standard.
      // Most wrappers use 'api-key'.
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API Error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  public async handleCallTool(name: string, args: any) {
    try {
      if (name === "midjourney_imagine") {
        const { prompt, aspect_ratio, process_mode, webhook_url } = args;
        const result = await this.callApi("/imagine", "POST", {
          prompt,
          aspect_ratio,
          process_mode,
          webhook_url,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "midjourney_upscale") {
        const { task_id, index } = args;
        const result = await this.callApi("/upscale", "POST", {
          task_id,
          index,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "midjourney_variation") {
        const { task_id, index } = args;
        const result = await this.callApi("/variation", "POST", {
          task_id,
          index,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "midjourney_describe") {
        const { image_url } = args;
        const result = await this.callApi("/describe", "POST", {
          image_url,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "midjourney_blend") {
        const { image_urls, dimensions } = args;
        const result = await this.callApi("/blend", "POST", {
          image_urls,
          dimensions,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "midjourney_face_swap") {
        const { source_url, target_url } = args;
        const result = await this.callApi("/face-swap", "POST", {
          source_url,
          target_url,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "midjourney_status") {
        const { task_id } = args;
        // Some APIs use GET /status?task_id=... or GET /task/{task_id}
        // I'll assume a standard POST /status or GET with query param.
        // Let's try GET /status?task_id= first as it's common for status checks.
        // Or often generic wrapper uses GET /result?taskId=...
        // Let's stick to a generic endpoint assumption.
        // Based on UserAPI.ai: POST /status { task_id: ... }
        const result = await this.callApi("/status", "POST", {
          task_id,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
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

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Midjourney MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new MidjourneyServer();
  server.run().catch((err) => {
    console.error("Fatal error in Midjourney MCP Server:", err);
    process.exit(1);
  });
}
