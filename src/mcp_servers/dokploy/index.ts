import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

export class DokployServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "dokploy-mcp-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "dokploy_list_projects",
      "List all projects in Dokploy.",
      {},
      async () => {
        const projects = await callDokploy("/api/project.all");
        return {
          content: [{ type: "text" as const, text: JSON.stringify(projects, null, 2) }],
        };
      }
    );

    this.server.tool(
      "dokploy_create_project",
      "Create a new project in Dokploy.",
      {
        name: z.string().describe("Name of the project"),
        description: z.string().optional().describe("Description of the project"),
      },
      async ({ name, description }) => {
        const result = await callDokploy("/api/project.create", "POST", {
          name,
          description,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "dokploy_create_application",
      "Create a new application in a project.",
      {
        projectId: z.string().describe("ID of the project"),
        name: z.string().describe("Name of the application"),
        appName: z.string().optional().describe("App name (optional, alias)"),
        description: z.string().optional(),
      },
      async ({ projectId, name, appName, description }) => {
        const result = await callDokploy("/api/application.create", "POST", {
          projectId,
          name: name || appName,
          description,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "dokploy_deploy_application",
      "Deploy an application in Dokploy.",
      {
        applicationId: z.string().describe("ID of the application"),
      },
      async ({ applicationId }) => {
        const result = await callDokploy("/api/application.deploy", "POST", {
          applicationId,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );

    this.server.tool(
      "dokploy_get_application",
      "Get details of an application.",
      {
        applicationId: z.string().describe("ID of the application"),
      },
      async ({ applicationId }) => {
        const result = await callDokploy(
          `/api/application.one?applicationId=${applicationId}`,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
    );
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
