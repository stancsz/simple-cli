import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";

async function callCoolify(
  endpoint: string,
  method: string = "GET",
  body?: any,
) {
  const COOLIFY_API_URL = process.env.COOLIFY_API_URL;
  const COOLIFY_API_KEY = process.env.COOLIFY_API_KEY;

  if (!COOLIFY_API_URL || !COOLIFY_API_KEY) {
    throw new Error(
      "COOLIFY_API_URL and COOLIFY_API_KEY environment variables are required",
    );
  }

  const url = `${COOLIFY_API_URL.replace(/\/$/, "")}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${COOLIFY_API_KEY}`,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Coolify API error: ${response.status} ${response.statusText} - ${error}`,
    );
  }

  return response.json();
}

const LIST_SERVICES_TOOL: Tool = {
  name: "coolify_list_services",
  description: "List all services in Coolify.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const LIST_APPLICATIONS_TOOL: Tool = {
  name: "coolify_list_applications",
  description: "List all applications in Coolify.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const DEPLOY_SERVICE_TOOL: Tool = {
  name: "coolify_deploy_service",
  description: "Deploy a service or application in Coolify by UUID.",
  inputSchema: {
    type: "object",
    properties: {
      uuid: { type: "string", description: "UUID of the resource to deploy" },
      force: { type: "boolean", description: "Force deploy (optional)" },
    },
    required: ["uuid"],
  },
};

export class CoolifyServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "coolify-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [LIST_SERVICES_TOOL, LIST_APPLICATIONS_TOOL, DEPLOY_SERVICE_TOOL],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  async handleCallTool(name: string, args: any) {
    try {
      if (name === "coolify_list_services") {
        const services = await callCoolify("/api/v1/services");
        return {
          content: [{ type: "text", text: JSON.stringify(services, null, 2) }],
        };
      }

      if (name === "coolify_list_applications") {
        const apps = await callCoolify("/api/v1/applications");
        return {
          content: [{ type: "text", text: JSON.stringify(apps, null, 2) }],
        };
      }

      if (name === "coolify_deploy_service") {
        const { uuid, force } = args as any;
        const result = await callCoolify(
          `/api/v1/deploy?uuid=${uuid}${force ? "&force=true" : ""}`,
          "GET",
        );
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
    console.error("Coolify MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new CoolifyServer().run().catch((error) => {
    console.error("Fatal error in Coolify MCP Server:", error);
    process.exit(1);
  });
}
