import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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

export class CoolifyServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "coolify-mcp-server",
      version: "1.0.0",
    });
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "coolify_list_services",
      "List all services in Coolify.",
      {},
      async () => {
        const services = await callCoolify("/api/v1/services");
        return {
          content: [{ type: "text", text: JSON.stringify(services, null, 2) }],
        };
      }
    );

    this.server.tool(
      "coolify_list_applications",
      "List all applications in Coolify.",
      {},
      async () => {
        const apps = await callCoolify("/api/v1/applications");
        return {
          content: [{ type: "text", text: JSON.stringify(apps, null, 2) }],
        };
      }
    );

    this.server.tool(
      "coolify_deploy_service",
      "Deploy a service or application in Coolify by UUID.",
      {
        uuid: z.string().describe("UUID of the resource to deploy"),
        force: z.boolean().optional().describe("Force deploy (optional)"),
      },
      async ({ uuid, force }) => {
        const result = await callCoolify(
          `/api/v1/deploy?uuid=${uuid}${force ? "&force=true" : ""}`,
          "GET",
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }
    );
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
