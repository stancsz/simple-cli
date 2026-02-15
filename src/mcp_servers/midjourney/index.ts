import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

export class MidjourneyServer {
  private server: McpServer;
  private apiUrl: string;
  private apiKey: string | undefined;

  constructor() {
    this.server = new McpServer({
      name: "midjourney-server",
      version: "1.0.0",
    });

    this.apiUrl =
      process.env.MIDJOURNEY_API_URL || "https://api.userapi.ai/midjourney/v2";
    this.apiKey = process.env.MIDJOURNEY_API_KEY;

    this.setupTools();
  }

  private async callApi(endpoint: string, method: string, body?: any) {
    if (!this.apiKey) {
      throw new Error("MIDJOURNEY_API_KEY environment variable is not set.");
    }

    const url = `${this.apiUrl}${endpoint}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "api-key": this.apiKey,
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

  private setupTools() {
    this.server.tool(
      "midjourney_imagine",
      "Generate an image from a prompt using Midjourney.",
      {
        prompt: z.string().describe("The prompt to generate an image from."),
        aspect_ratio: z.string().optional().describe("Aspect ratio for the image (e.g., '16:9', '1:1')."),
        process_mode: z.string().optional().describe("Process mode: 'fast', 'relax', or 'turbo'."),
        webhook_url: z.string().optional().describe("Optional webhook URL for task updates."),
      },
      async (args) => {
        const result = await this.callApi("/imagine", "POST", args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "midjourney_upscale",
      "Upscale a generated image (U1-U4).",
      {
        task_id: z.string().describe("The ID of the task containing the image to upscale."),
        index: z.number().int().min(1).max(4).describe("The index of the image to upscale (1-4)."),
      },
      async (args) => {
        const result = await this.callApi("/upscale", "POST", args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "midjourney_variation",
      "Create a variation of a generated image (V1-V4).",
      {
        task_id: z.string().describe("The ID of the task containing the image to create a variation of."),
        index: z.number().int().min(1).max(4).describe("The index of the image to vary (1-4)."),
      },
      async (args) => {
        const result = await this.callApi("/variation", "POST", args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "midjourney_describe",
      "Describe an image from a URL.",
      {
        image_url: z.string().describe("The URL of the image to describe."),
      },
      async (args) => {
        const result = await this.callApi("/describe", "POST", args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "midjourney_blend",
      "Blend multiple images together.",
      {
        image_urls: z.array(z.string()).describe("List of image URLs to blend."),
        dimensions: z.string().optional().describe("Dimensions: 'SQUARE', 'PORTRAIT', or 'LANDSCAPE'."),
      },
      async (args) => {
        const result = await this.callApi("/blend", "POST", args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "midjourney_face_swap",
      "Swap face from source image to target image.",
      {
        source_url: z.string().describe("URL of the source image (face provider)."),
        target_url: z.string().describe("URL of the target image (face receiver)."),
      },
      async (args) => {
        const result = await this.callApi("/face-swap", "POST", args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "midjourney_status",
      "Check the status of a Midjourney task.",
      {
        task_id: z.string().describe("The ID of the task to check."),
      },
      async (args) => {
        const result = await this.callApi("/status", "POST", args);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );
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
