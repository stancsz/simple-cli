import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { fileURLToPath } from "url";

async function callDokploy(
  endpoint: string,
  method: string = "GET",
  body?: any,
) {
  const DOKPLOY_API_URL = process.env.DOKPLOY_API_URL;
  const DOKPLOY_API_KEY = process.env.DOKPLOY_API_KEY;

  if (!DOKPLOY_API_URL || !DOKPLOY_API_KEY) {
    throw new Error(
      "DOKPLOY_API_URL and DOKPLOY_API_KEY environment variables are required",
    );
  }

  const url = `${DOKPLOY_API_URL.replace(/\/$/, "")}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": DOKPLOY_API_KEY,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Dokploy API error: ${response.status} ${response.statusText} - ${error}`,
    );
  }

  return response.json();
}

const LIST_PROJECTS_TOOL: Tool = {
  name: "dokploy_list_projects",
  description: "List all projects in Dokploy.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

const CREATE_PROJECT_TOOL: Tool = {
  name: "dokploy_create_project",
  description: "Create a new project in Dokploy.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name of the project" },
      description: {
        type: "string",
        description: "Description of the project",
      },
    },
    required: ["name"],
  },
};

const CREATE_APPLICATION_TOOL: Tool = {
  name: "dokploy_create_application",
  description: "Create a new application in a project.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "ID of the project" },
      name: { type: "string", description: "Name of the application" },
      appName: { type: "string", description: "App name (optional, alias)" },
      description: { type: "string" },
    },
    required: ["projectId", "name"],
  },
};

const DEPLOY_APPLICATION_TOOL: Tool = {
  name: "dokploy_deploy_application",
  description: "Deploy an application in Dokploy.",
  inputSchema: {
    type: "object",
    properties: {
      applicationId: { type: "string", description: "ID of the application" },
    },
    required: ["applicationId"],
  },
};

const GET_APPLICATION_TOOL: Tool = {
  name: "dokploy_get_application",
  description: "Get details of an application.",
  inputSchema: {
    type: "object",
    properties: {
      applicationId: { type: "string", description: "ID of the application" },
    },
    required: ["applicationId"],
  },
};

export class DokployServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "dokploy-mcp-server",
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
      tools: [
        LIST_PROJECTS_TOOL,
        CREATE_PROJECT_TOOL,
        CREATE_APPLICATION_TOOL,
        DEPLOY_APPLICATION_TOOL,
        GET_APPLICATION_TOOL,
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return this.handleCallTool(name, args);
    });
  }

  async handleCallTool(name: string, args: any) {
    try {
      if (name === "dokploy_list_projects") {
        const projects = await callDokploy("/api/project.all");
        return {
          content: [{ type: "text", text: JSON.stringify(projects, null, 2) }],
        };
      }

      if (name === "dokploy_create_project") {
        const { name, description } = args as any;
        const result = await callDokploy("/api/project.create", "POST", {
          name,
          description,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "dokploy_create_application") {
        const { projectId, name, appName, description } = args as any;
        const result = await callDokploy("/api/application.create", "POST", {
          projectId,
          name: name || appName,
          description,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "dokploy_deploy_application") {
        const { applicationId } = args as any;
        const result = await callDokploy("/api/application.deploy", "POST", {
          applicationId,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (name === "dokploy_get_application") {
        const { applicationId } = args as any;
        const result = await callDokploy(
          `/api/application.one?applicationId=${applicationId}`,
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
    console.error("Dokploy MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  new DokployServer().run().catch((error) => {
    console.error("Fatal error in Dokploy MCP Server:", error);
    process.exit(1);
  });
}
