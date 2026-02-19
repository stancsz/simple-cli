import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { SwarmManager } from "./manager.js";

export class AgentSwarmServer {
  private server: McpServer;
  private manager: SwarmManager;

  constructor() {
    this.server = new McpServer({
      name: "agent_swarm",
      version: "1.0.0",
    });

    this.manager = new SwarmManager();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "list_swarm_agents",
      "List available agent types that can be spawned as sub-agents.",
      {},
      async () => {
        const agents = await this.manager.listAgents();
        const list = Object.entries(agents).map(([type, config]) =>
          `- ${type}: ${config.description || 'No description'}`
        ).join('\n');

        return {
          content: [{ type: "text", text: list || "No swarm-capable agents found in configuration." }]
        };
      }
    );

    this.server.tool(
      "spawn_agent",
      "Spawn a new sub-agent process with a specific role and context.",
      {
        agent_type: z.string().describe("The type of agent to spawn (must be in list_swarm_agents)."),
        role_description: z.string().describe("A description of the agent's specific role (e.g., 'QA Engineer')."),
        initial_context: z.string().describe("Initial context or task description for the agent."),
      },
      async ({ agent_type, role_description, initial_context }) => {
        try {
          const result = await this.manager.spawn({ agent_type, role_description, initial_context });
          return {
            content: [{ type: "text", text: `Agent spawned successfully.\nID: ${result.swarm_agent_id}\nPID: ${result.pid}` }]
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Failed to spawn agent: ${e.message}` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      "terminate_agent",
      "Terminate a running sub-agent.",
      {
        swarm_agent_id: z.string().describe("The ID of the agent to terminate."),
      },
      async ({ swarm_agent_id }) => {
        const success = await this.manager.terminate(swarm_agent_id);
        if (success) {
          return { content: [{ type: "text", text: `Agent ${swarm_agent_id} terminated.` }] };
        } else {
          return {
            content: [{ type: "text", text: `Agent ${swarm_agent_id} not found or already terminated.` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      "list_active_agents",
      "List currently running sub-agents.",
      {},
      async () => {
        const active = this.manager.getActiveAgents();
        if (active.length === 0) {
          return { content: [{ type: "text", text: "No active agents." }] };
        }
        const list = active.map(a =>
          `- ID: ${a.id} | Type: ${a.type} | Role: ${a.role_description} | PID: ${a.pid}`
        ).join('\n');
        return { content: [{ type: "text", text: list }] };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Agent Swarm Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new AgentSwarmServer();
  server.run().catch((err) => {
    console.error("Fatal error in Agent Swarm Server:", err);
    process.exit(1);
  });
}
