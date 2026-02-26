import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MCP } from "../../mcp.js";
import { fileURLToPath } from "url";

export class DreamingServer {
  private server: McpServer;
  private mcp: MCP;

  constructor() {
    this.server = new McpServer({
      name: "dreaming",
      version: "1.0.0",
    });
    this.mcp = new MCP();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "start_dreaming_session",
      "Start an offline simulation session to replay and fix past failures.",
      {
        simulation_count: z.number().optional().default(3).describe("Max number of failures to attempt."),
        company_id: z.string().optional().describe("The company context ID."),
      },
      async ({ simulation_count, company_id }) => {
        return await this.startSession(simulation_count, company_id);
      }
    );

    this.server.tool(
      "start_framework_optimization_session",
      "Analyzes framework integration performance and generates optimization patterns.",
      {
         limit: z.number().optional().default(5).describe("Number of past outcomes to analyze.")
      },
      async ({ limit }) => {
         return await this.startOptimizationSession(limit);
      }
    );
  }

  async startOptimizationSession(limit: number) {
      await this.mcp.init();

      // Ensure Framework Optimizer is running
      try {
          await this.mcp.startServer("framework-optimizer");
      } catch (e) {
          // Ignore if already running or if auto-start logic handles it
      }

      const optimizer = this.mcp.getClient("framework-optimizer");
      if (!optimizer) {
          return { content: [{ type: "text", text: "Framework Optimizer server not available." }], isError: true };
      }

      try {
          const res: any = await optimizer.callTool({
              name: "propose_integration_optimization",
              arguments: { limit }
          });
          return res;
      } catch (e) {
          return { content: [{ type: "text", text: `Optimization session failed: ${(e as Error).message}` }], isError: true };
      }
  }

  async startSession(limit: number = 3, companyId?: string) {
    await this.mcp.init();

    // 1. Check Idleness
    try {
        const swarm = this.mcp.getClient("swarm-server");
        if (swarm) {
            const res: any = await swarm.callTool({ name: "list_agents", arguments: {} });
            if (res && res.content && res.content[0]) {
                let agents: any[] = [];
                try {
                    agents = JSON.parse(res.content[0].text);
                } catch {
                    agents = [];
                }

                if (agents.length > 0) {
            return { content: [{ type: "text" as const, text: "System is not idle. Dreaming session aborted." }] };
                }
            }
        }
    } catch (e) {
        console.warn("Failed to check idleness:", e);
    }

    // 2. Query Failures
    const brain = this.mcp.getClient("brain");
    if (!brain) {
        return { content: [{ type: "text" as const, text: "Brain server not available." }] };
    }

    let failures: any[] = [];
    try {
        const res: any = await brain.callTool({
            name: "brain_query",
            arguments: {
                query: "Outcome: failure",
                limit,
                company: companyId,
                format: "json"
            }
        });
        if (res && res.content && res.content[0]) {
            try {
                failures = JSON.parse(res.content[0].text);
            } catch {
                failures = [];
            }
        }
    } catch (e) {
        return { content: [{ type: "text" as const, text: `Failed to query brain: ${(e as Error).message}` }] };
    }

    if (!Array.isArray(failures) || failures.length === 0) {
        return { content: [{ type: "text" as const, text: "No failure episodes found to simulate." }] };
    }

    // 3. Simulate
    const results: string[] = [];
    const swarm = this.mcp.getClient("swarm-server");
    if (!swarm) {
         return { content: [{ type: "text" as const, text: "Swarm server not available." }] };
    }

    for (const fail of failures) {
        if (fail.resolved_via_dreaming) continue; // Skip already resolved

        // Negotiate Agent Role via Swarm Intelligence
        let role = "Senior Developer";
        let strategy = "Standard fix.";
        let negotiationData = {};

        try {
            const negRes: any = await swarm.callTool({
                name: "negotiate_task",
                arguments: {
                    task_description: `Fix failure: ${fail.userPrompt}\nFailure Output: ${fail.agentResponse}`,
                    simulation_mode: true,
                    agent_ids: []
                }
            });

            if (negRes && negRes.content && negRes.content[0]) {
                 try {
                     const negJson = JSON.parse(negRes.content[0].text);
                     if (negJson.winning_bid && negJson.winning_bid.role) {
                         role = negJson.winning_bid.role;
                         strategy = negJson.strategy || strategy;
                         negotiationData = negJson;
                         console.error(`[Dreaming] Swarm Intelligence negotiated role: ${role}`);
                     }
                 } catch (e) {
                     console.warn("Failed to parse negotiation result", e);
                 }
            }
        } catch (e) {
            console.warn("Negotiation failed, falling back to default role:", e);
        }

        const taskPrompt = `This is a simulation to fix a past failure.
        Original Task ID: ${fail.taskId}
        Original Request: ${fail.userPrompt}
        Previous Output (Failure): ${fail.agentResponse}

        Adopt Role: ${role}
        Strategy: ${strategy}

        Your Goal: specifically address the failure reason and complete the task successfully.`;

        try {
            const simRes: any = await swarm.callTool({
                name: "run_simulation",
                arguments: {
                    role: role,
                    task: taskPrompt,
                    company_id: companyId
                }
            });

            const simOutput = simRes.content[0].text;

            // Heuristic check for success
            const isSuccess = !simOutput.toLowerCase().includes("failure") &&
                              !simOutput.toLowerCase().includes("error") &&
                              (simOutput.toLowerCase().includes("success") || simOutput.toLowerCase().includes("completed"));

            if (isSuccess) {
                // Delete old
                await brain.callTool({
                    name: "brain_delete_episode",
                    arguments: { id: fail.id, company: companyId }
                });

                // Store new
                const attempts = fail.simulation_attempts ? [...fail.simulation_attempts] : [];
                attempts.push(`[${new Date().toISOString()}] Success: ${simOutput.substring(0, 100)}...`);

                await brain.callTool({
                    name: "brain_store",
                    arguments: {
                        taskId: fail.taskId,
                        request: fail.userPrompt,
                        solution: `[Dreaming Resolved] ${simOutput}`,
                        company: companyId,
                        simulation_attempts: JSON.stringify(attempts),
                        resolved_via_dreaming: true,
                        dreaming_outcomes: JSON.stringify(negotiationData),
                        // artifacts: fail.artifacts // Preserve artifacts?
                    }
                });

                // Store negotiation pattern
                if (negotiationData && Object.keys(negotiationData).length > 0) {
                     try {
                         await brain.callTool({
                            name: "brain_store",
                            arguments: {
                                taskId: `pattern-${fail.taskId}`,
                                request: `Swarm Negotiation for task: ${fail.userPrompt}`,
                                solution: `Swarm recommended role: ${role}. Strategy: ${strategy}. Outcome: Success.`,
                                company: companyId,
                                type: "swarm_negotiation_pattern",
                                related_episode_id: fail.id,
                                dreaming_outcomes: JSON.stringify(negotiationData)
                            }
                        });
                     } catch (e) {
                         console.warn("Failed to store negotiation pattern:", e);
                     }
                }

                results.push(`Fixed failure ${fail.taskId} using role ${role}`);
            } else {
                 // Log attempt in existing episode (update)
                 const attempts = fail.simulation_attempts ? [...fail.simulation_attempts] : [];
                 attempts.push(`[${new Date().toISOString()}] Failed with role ${role}: ${simOutput.substring(0, 100)}...`);

                 // Delete old to avoid duplication (since store appends)
                 await brain.callTool({
                    name: "brain_delete_episode",
                    arguments: { id: fail.id, company: companyId }
                 });

                 // We re-store with same ID to update
                 await brain.callTool({
                    name: "brain_store",
                    arguments: {
                        id: fail.id,
                        taskId: fail.taskId,
                        request: fail.userPrompt,
                        solution: fail.agentResponse, // Keep original failure response
                        company: companyId,
                        simulation_attempts: JSON.stringify(attempts),
                        resolved_via_dreaming: false,
                        dreaming_outcomes: JSON.stringify(negotiationData)
                    }
                 });
                 results.push(`Attempted ${fail.taskId} with role ${role} but failed again.`);
            }

        } catch (e) {
            results.push(`Error simulating ${fail.taskId}: ${(e as Error).message}`);
        }
    }

    return {
        content: [{ type: "text" as const, text: `Dreaming session complete.\n${results.join("\n")}` }]
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Dreaming MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new DreamingServer();
  server.run().catch((err) => {
    console.error("Fatal error in Dreaming MCP Server:", err);
    process.exit(1);
  });
}
