import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Engine, Context, Registry } from "../../engine/orchestrator.js";
import { MCP } from "../../mcp.js";
import { createLLM } from "../../llm.js";
import { builtinSkills } from "../../skills.js";
import { fileURLToPath } from "url";

export class SwarmServer {
  private server: McpServer;
  public workers: Map<string, Engine> = new Map();
  public workerContexts: Map<string, Context> = new Map();
  public workerDetails: Map<string, { role: string; parentId?: string }> = new Map();
  private mcp: MCP;
  private llm: ReturnType<typeof createLLM>;

  constructor() {
    this.server = new McpServer({
      name: "swarm-server",
      version: "1.0.0",
    });
    this.mcp = new MCP();
    this.llm = createLLM();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "spawn_subagent",
      "Dynamically create a new agent instance with a specialized role and delegated task.",
      {
        role: z.string().describe("The specialized role (e.g., 'QA Engineer', 'Docs Writer')."),
        task: z.string().describe("The initial task description."),
        parent_agent_id: z.string().describe("The ID of the parent agent spawning this sub-agent."),
        company_id: z.string().optional().describe("The company context ID."),
      },
      async ({ role, task, parent_agent_id, company_id }) => {
        return await this.spawnSubAgent(role, task, parent_agent_id, company_id);
      }
    );

    this.server.tool(
      "negotiate_task",
      "Facilitate bidding/negotiation between multiple agents for task assignment.",
      {
        agent_ids: z.array(z.string()).describe("List of agent IDs to invite for negotiation."),
        task_description: z.string().describe("The task to be assigned."),
      },
      async ({ agent_ids, task_description }) => {
        return await this.negotiateTask(agent_ids, task_description);
      }
    );

    this.server.tool(
      "list_agents",
      "List all active swarm agents.",
      {},
      async () => {
        return await this.listAgents();
      }
    );
  }

  async spawnSubAgent(role: string, task: string, parentId: string, companyId?: string) {
    const agentId = `${role.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    // Initialize Engine for the new agent
    const llm = createLLM();
    const mcp = new MCP(); // New MCP connection for the sub-agent
    const registry = new Registry();
    const engine = new Engine(llm, registry, mcp);

    this.workers.set(agentId, engine);

    // Setup Context
    const baseSkill = builtinSkills.code; // Default base skill
    const systemPrompt = `You are a ${role} (Agent ID: ${agentId}). Your goal is to complete the assigned task efficiently. Report back to your parent agent (${parentId}) when done.`;

    const skill = {
      ...baseSkill,
      name: role,
      systemPrompt: systemPrompt,
    };

    const context = new Context(process.cwd(), skill as any);
    this.workerContexts.set(agentId, context);
    this.workerDetails.set(agentId, { role, parentId });

    // Log to Brain (using SwarmServer's MCP instance)
    try {
        await this.mcp.init();
        const brainClient = this.mcp.getClient("brain");
        if (brainClient) {
            await brainClient.callTool({
                name: "log_experience",
                arguments: {
                    taskId: `spawn-${agentId}`,
                    task_type: "spawn_subagent",
                    agent_used: parentId,
                    outcome: "success",
                    summary: `Spawned ${role} (${agentId}) for task: ${task}`,
                    company: companyId
                }
            });
        }
    } catch (e) {
        console.error(`[Swarm] Failed to log to Brain: ${(e as Error).message}`);
    }

    // Execute initial task if provided?
    // The tool description says "delegated task".
    // Usually spawning implies starting the work.
    // However, for testing, we might just want to spawn it.
    // Let's run it briefly to initialize or acknowledge.

    try {
        await engine.run(context, `[System Init] You have been spawned. Task: ${task}. Acknowledge and start.`, { interactive: false, company: companyId });
    } catch (e) {
        console.error(`[Swarm] Agent ${agentId} failed to start: ${(e as Error).message}`);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ agent_id: agentId, status: "spawned", role }),
        },
      ],
    };
  }

  async negotiateTask(agentIds: string[], taskDescription: string) {
    const bids: Array<{ agentId: string; cost: number; quality: number; rationale: string }> = [];

    for (const agentId of agentIds) {
        const engine = this.workers.get(agentId);
        const context = this.workerContexts.get(agentId);

        if (!engine || !context) {
            console.warn(`[Swarm] Agent ${agentId} not found, skipping negotiation.`);
            continue;
        }

        // Ask for a bid
        const bidPrompt = `[Negotiation] New Task Available: "${taskDescription}".
        Please provide a bid in the following JSON format:
        {
            "cost": <number 1-100, lower is better>,
            "quality": <number 1-100, higher is better>,
            "rationale": "<short explanation>"
        }
        Base your bid on your role and capabilities.`;

        // We need to capture the response. engine.run doesn't return the text directly in all versions,
        // but it modifies context.history.
        const initialHistoryLength = context.history.length;

        try {
            await engine.run(context, bidPrompt, { interactive: false });

            const newMessages = context.history.slice(initialHistoryLength);
            const lastMessage = newMessages.filter(m => m.role === "assistant").pop();

            if (lastMessage) {
                // Parse JSON from response
                const content = lastMessage.content;
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    try {
                        const bid = JSON.parse(jsonMatch[0]);
                        bids.push({
                            agentId,
                            cost: Number(bid.cost) || 50,
                            quality: Number(bid.quality) || 50,
                            rationale: bid.rationale || "No rationale provided"
                        });
                    } catch (e) {
                        console.warn(`[Swarm] Failed to parse bid from ${agentId}:`, e);
                    }
                }
            }
        } catch (e) {
             console.error(`[Swarm] Error getting bid from ${agentId}:`, e);
        }
    }

    if (bids.length === 0) {
        return {
            content: [{ type: "text" as const, text: "Negotiation failed: No valid bids received." }]
        };
    }

    // Select Winner (Simple Heuristic: Score = Quality - Cost/2)
    // Higher score wins.
    bids.sort((a, b) => {
        const scoreA = a.quality - (a.cost / 2);
        const scoreB = b.quality - (b.cost / 2);
        return scoreB - scoreA;
    });

    const winner = bids[0];

    // Log negotiation to Brain
    try {
        await this.mcp.init();
        const brainClient = this.mcp.getClient("brain");
        if (brainClient) {
            await brainClient.callTool({
                name: "log_experience",
                arguments: {
                    taskId: `negotiation-${Date.now()}`,
                    task_type: "negotiate_task",
                    agent_used: "swarm-orchestrator",
                    outcome: "success",
                    summary: `Negotiation for "${taskDescription}". Winner: ${winner.agentId}. Bids: ${JSON.stringify(bids)}`
                }
            });
        }
    } catch (e) {
        // Ignore
    }

    return {
        content: [
            {
                type: "text" as const,
                text: JSON.stringify({
                    winner_id: winner.agentId,
                    winning_bid: winner,
                    all_bids: bids
                }, null, 2)
            }
        ]
    };
  }

  async listAgents() {
      const agents = Array.from(this.workerDetails.entries()).map(([id, details]) => ({
          id,
          ...details
      }));
      return {
          content: [{ type: "text" as const, text: JSON.stringify(agents, null, 2) }]
      };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Swarm MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SwarmServer();
  server.run().catch((err) => {
    console.error("Fatal error in Swarm MCP Server:", err);
    process.exit(1);
  });
}
