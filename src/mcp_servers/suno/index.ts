import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";

const API_BASE_URL = "https://api.sunoapi.org/api/v1";

export class SunoServer {
  private server: McpServer;
  private apiKey: string;

  constructor() {
    this.server = new McpServer({
      name: "suno-server",
      version: "1.0.0",
    });

    this.apiKey = process.env.SUNO_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: SUNO_API_KEY environment variable is not set.");
    }

    this.setupTools();
  }

  private async makeRequest(endpoint: string, method: string, body?: any) {
    if (!this.apiKey) {
      throw new Error("SUNO_API_KEY is not configured.");
    }

    // This API seems to require Bearer token
    const headers = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Suno API Error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  private setupTools() {
    this.server.tool(
      "suno_generate_music",
      "Generate music using Suno AI. Returns a task ID.",
      {
        prompt: z.string().optional().describe("Description of the music to generate. Required for non-custom mode."),
        customMode: z.boolean().optional().default(false).describe("Enable custom mode for advanced settings (default: false)."),
        instrumental: z.boolean().optional().default(false).describe("Generate instrumental music (default: false)."),
        model: z.string().optional().default("V4_5ALL").describe("Model version (e.g., 'V4_5ALL', 'V4', 'V5'). Default: 'V4_5ALL'."),
        style: z.string().optional().describe("Music style/genre (e.g., 'Classical', 'Jazz'). Required in custom mode."),
        title: z.string().optional().describe("Title of the track. Required in custom mode."),
        callBackUrl: z.string().optional().describe("Callback URL for notifications. Defaults to a dummy URL."),
      },
      async (args) => {
        const payload: any = {
            customMode: args.customMode || false,
            instrumental: args.instrumental || false,
            model: args.model || "V4_5ALL",
            callBackUrl: args.callBackUrl || "https://example.com/callback",
            prompt: args.prompt,
            style: args.style,
            title: args.title,
        };
        // If customMode is false, style and title should be undefined/ignored by API usually, but safe to remove
        if (!payload.customMode) {
            delete payload.style;
            delete payload.title;
        }

        const result = await this.makeRequest("/generate", "POST", payload);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "suno_generate_lyrics",
      "Generate lyrics using Suno AI. Returns a task ID.",
      {
        prompt: z.string().describe("Description of the lyrics content."),
      },
      async ({ prompt }) => {
        const payload = {
          prompt,
          callBackUrl: "https://example.com/callback",
        };
        const result = await this.makeRequest("/lyrics", "POST", payload);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "suno_extend_music",
      "Extend an existing music track. Returns a task ID.",
      {
        audioId: z.string().describe("The ID of the audio track to extend."),
        continueAt: z.number().optional().describe("Time in seconds to start extension from."),
        prompt: z.string().optional().describe("Description for the extension."),
        style: z.string().optional().describe("Style for the extension."),
        title: z.string().optional().describe("Title for the extended track."),
        model: z.string().optional().describe("Model version (must match source audio model). Default: 'V4_5ALL'."),
      },
      async (args) => {
        const payload = {
          defaultParamFlag: true, // Use custom params
          audioId: args.audioId,
          model: args.model || "V4_5ALL",
          callBackUrl: "https://example.com/callback",
          prompt: args.prompt || "Extend the music",
          style: args.style || "",
          title: args.title || "Extended Track",
          continueAt: args.continueAt || 0,
        };
        const result = await this.makeRequest("/generate/extend", "POST", payload);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "suno_upload_and_cover",
      "Upload an audio file and cover/remix it. Returns a task ID.",
      {
        uploadUrl: z.string().describe("URL of the audio file to upload."),
        prompt: z.string().optional().describe("Description for the cover/remix."),
        style: z.string().optional().describe("Target style for the cover."),
        title: z.string().optional().describe("Title of the new track."),
        model: z.string().optional().describe("Model version. Default: 'V4_5ALL'."),
      },
      async (args) => {
        const payload = {
          uploadUrl: args.uploadUrl,
          customMode: true,
          instrumental: false,
          model: args.model || "V4_5ALL",
          callBackUrl: "https://example.com/callback",
          prompt: args.prompt || "Remix this track",
          style: args.style || "Pop",
          title: args.title || "Remix",
        };
        const result = await this.makeRequest("/generate/upload-cover", "POST", payload);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "suno_get_music_details",
      "Get details of a generation task (status, audio URLs, etc.).",
      {
        taskId: z.string().describe("The task ID returned by generation tools."),
      },
      async ({ taskId }) => {
        const endpoint = `/generate/record-info?taskId=${taskId}`;
        const result = await this.makeRequest(endpoint, "GET");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "suno_get_credits",
      "Get remaining account credits.",
      {},
      async () => {
        const result = await this.makeRequest("/generate/credit", "GET");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Suno MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SunoServer();
  server.run().catch((err) => {
    console.error("Fatal error in Suno MCP Server:", err);
    process.exit(1);
  });
}
