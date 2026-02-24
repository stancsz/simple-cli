import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "mock-swarm-server",
  version: "1.0.0",
});

let agents: any[] = [];

server.tool(
  "spawn_subagent",
  "Spawn agent",
  {
    role: z.string(),
    task: z.string(),
    parent_agent_id: z.string(),
    company_id: z.string().optional()
  },
  async ({ role, task, parent_agent_id }) => {
    const id = `${role}-mock-${Date.now()}`;
    agents.push({ id, role, task, parentId: parent_agent_id });
    return {
      content: [{ type: "text", text: JSON.stringify({ agent_id: id, status: "spawned", role }) }]
    };
  }
);

server.tool(
  "terminate_agent",
  "Terminate agent",
  { agent_id: z.string() },
  async ({ agent_id }) => {
    agents = agents.filter(a => a.id !== agent_id);
    return {
      content: [{ type: "text", text: `Agent ${agent_id} terminated successfully.` }]
    };
  }
);

server.tool(
  "list_agents",
  "List agents",
  {},
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(agents) }]
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Mock Server Error:", err);
  process.exit(1);
});
