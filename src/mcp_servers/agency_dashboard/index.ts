import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createDashboardServer } from "./dashboard_server.js";
import { fileURLToPath } from 'url';

const server = new McpServer({
  name: "agency_dashboard",
  version: "1.0.0",
});

// We can expose tools here if needed, but primarily this server is for the Dashboard UI
// Tools might be "get_dashboard_url" or similar.

async function main() {
    // If running as a standalone process for the dashboard (via CLI)
    // We expect PORT to be set (e.g. 3002)
    const port = process.env.PORT ? parseInt(process.env.PORT) : null;

    if (port) {
        await createDashboardServer(port);
    } else {
        // If running as MCP server via Stdio (e.g. by mcp.ts auto-discovery)
        // We just connect the transport.
        // Note: The Express server won't start in this mode unless we want it to.
        // For the "Agency Dashboard" use case, we probably want the server to run when the tool is called?
        // Or maybe this MCP server is just a wrapper?
        // The prompt says "Launch the agency dashboard...".
        // So the CLI will likely set PORT=3002.

        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error("Agency Dashboard MCP Server running on stdio");
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
      console.error("Server error:", error);
      process.exit(1);
    });
}
