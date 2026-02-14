import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";

const API_BASE_URL = "https://api.sunoapi.org/api/v1";

// Tool Schemas
const GENERATE_MUSIC_TOOL = {
  name: "suno_generate_music",
  description: "Generate music using Suno AI. Returns a task ID.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Description of the music to generate. Required for non-custom mode.",
      },
      customMode: {
        type: "boolean",
        description: "Enable custom mode for advanced settings (default: false).",
      },
      instrumental: {
        type: "boolean",
        description: "Generate instrumental music (default: false).",
      },
      model: {
        type: "string",
        description: "Model version (e.g., 'V4_5ALL', 'V4', 'V5'). Default: 'V4_5ALL'.",
      },
      style: {
        type: "string",
        description: "Music style/genre (e.g., 'Classical', 'Jazz'). Required in custom mode.",
      },
      title: {
        type: "string",
        description: "Title of the track. Required in custom mode.",
      },
      callBackUrl: {
        type: "string",
        description: "Callback URL for notifications. Defaults to a dummy URL.",
      },
    },
  },
};

const GENERATE_LYRICS_TOOL = {
  name: "suno_generate_lyrics",
  description: "Generate lyrics using Suno AI. Returns a task ID.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description: "Description of the lyrics content.",
      },
    },
    required: ["prompt"],
  },
};

const EXTEND_MUSIC_TOOL = {
  name: "suno_extend_music",
  description: "Extend an existing music track. Returns a task ID.",
  inputSchema: {
    type: "object",
    properties: {
      audioId: {
        type: "string",
        description: "The ID of the audio track to extend.",
      },
      continueAt: {
        type: "number",
        description: "Time in seconds to start extension from.",
      },
      prompt: {
        type: "string",
        description: "Description for the extension.",
      },
      style: {
        type: "string",
        description: "Style for the extension.",
      },
      title: {
        type: "string",
        description: "Title for the extended track.",
      },
      model: {
        type: "string",
        description: "Model version (must match source audio model). Default: 'V4_5ALL'.",
      },
    },
    required: ["audioId"],
  },
};

const UPLOAD_AND_COVER_TOOL = {
  name: "suno_upload_and_cover",
  description: "Upload an audio file and cover/remix it. Returns a task ID.",
  inputSchema: {
    type: "object",
    properties: {
      uploadUrl: {
        type: "string",
        description: "URL of the audio file to upload.",
      },
      prompt: {
        type: "string",
        description: "Description for the cover/remix.",
      },
      style: {
        type: "string",
        description: "Target style for the cover.",
      },
      title: {
        type: "string",
        description: "Title of the new track.",
      },
      model: {
        type: "string",
        description: "Model version. Default: 'V4_5ALL'.",
      },
    },
    required: ["uploadUrl"],
  },
};

const GET_MUSIC_DETAILS_TOOL = {
  name: "suno_get_music_details",
  description: "Get details of a generation task (status, audio URLs, etc.).",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "The task ID returned by generation tools.",
      },
    },
    required: ["taskId"],
  },
};

const GET_CREDITS_TOOL = {
  name: "suno_get_credits",
  description: "Get remaining account credits.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export class SunoServer {
  private server: Server;
  private apiKey: string;

  constructor() {
    this.server = new Server(
      {
        name: "suno-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.apiKey = process.env.SUNO_API_KEY || "";
    if (!this.apiKey) {
      console.warn("Warning: SUNO_API_KEY environment variable is not set.");
    }

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        GENERATE_MUSIC_TOOL,
        GENERATE_LYRICS_TOOL,
        EXTEND_MUSIC_TOOL,
        UPLOAD_AND_COVER_TOOL,
        GET_MUSIC_DETAILS_TOOL,
        GET_CREDITS_TOOL,
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  private async makeRequest(endpoint: string, method: string, body?: any) {
    if (!this.apiKey) {
      throw new Error("SUNO_API_KEY is not configured.");
    }

    const headers = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };

    try {
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
    } catch (error: any) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  public async handleCallTool(name: string, args: any) {
    try {
      if (name === "suno_generate_music") {
        const payload = {
            customMode: args.customMode || false,
            instrumental: args.instrumental || false,
            model: args.model || "V4_5ALL",
            callBackUrl: args.callBackUrl || "https://example.com/callback",
            prompt: args.prompt,
            style: args.style,
            title: args.title,
        };
        // If customMode is false, style and title should be undefined
        if (!payload.customMode) {
            delete payload.style;
            delete payload.title;
        }

        const result = await this.makeRequest("/generate", "POST", payload);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "suno_generate_lyrics") {
        const payload = {
          prompt: args.prompt,
          callBackUrl: "https://example.com/callback",
        };
        const result = await this.makeRequest("/lyrics", "POST", payload);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "suno_extend_music") {
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "suno_upload_and_cover") {
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
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "suno_get_music_details") {
        const endpoint = `/generate/record-info?taskId=${args.taskId}`;
        const result = await this.makeRequest(endpoint, "GET");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "suno_get_credits") {
        const result = await this.makeRequest("/generate/credit", "GET");
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      throw new Error(`Tool not found: ${name}`);
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        isError: true,
      };
    }
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
