import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { persona } from "../../persona.js";

export class PersonaServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: "persona",
      version: "1.0.0",
    });

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "get_persona_config",
      "Get the current persona configuration.",
      {},
      async () => {
        await persona.loadConfig();
        const config = persona.getConfig();
        return {
          content: [{ type: "text", text: JSON.stringify(config, null, 2) }],
        };
      }
    );

    this.server.tool(
      "get_working_hours_status",
      "Get the current working hours status.",
      {},
      async () => {
        await persona.loadConfig();
        const status = persona.getWorkingHoursStatus();
        return {
          content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Persona MCP Server running on stdio");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = new PersonaServer();
  server.run().catch((err) => {
    console.error("Fatal error in Persona MCP Server:", err);
    process.exit(1);
  });
}
