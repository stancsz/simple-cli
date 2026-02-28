import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MCP } from "../../mcp.js";
import { fileURLToPath } from "url";
import { jsonrepair } from "jsonrepair";

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

    // Scheduling Hook: Monthly Market Positioning Analysis
    // Node.js setInterval maximum delay is 2,147,483,647 ms (~24.8 days).
    // Using 24 days to avoid 32-bit int overflow.
    const TWENTY_FOUR_DAYS = 24 * 24 * 60 * 60 * 1000;
    setInterval(async () => {
      try {
        console.error("[Dreaming] Triggering scheduled Market Positioning Analysis...");
        await this.mcp.init();
        // Fallback to business_ops as some deployments merge market analysis tools there
        const marketAnalysis = this.mcp.getClient("market_analysis");
        const analysisClient = marketAnalysis || this.mcp.getClient("business_ops");

        if (analysisClient) {
          await analysisClient.callTool({
            name: "analyze_and_adjust_positioning",
            arguments: {
              sector: "Software Development", // Example defaults
              region: "Global"
            }
          });
        }
      } catch (e: any) {
        console.error("[Dreaming] Scheduled Market Positioning failed:", e.message);
      }
    }, TWENTY_FOUR_DAYS);
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

                // HR Analysis & SOP Generation
                try {
                    const hr = this.mcp.getClient("hr_loop");
                    if (hr) {
                        // 1. Analyze Patterns
                        // Use casting to avoid type errors with unknown properties in negotiationData
                        const negotiationWithId = negotiationData as any;
                        const analysisRes: any = await hr.callTool({
                            name: "analyze_cross_swarm_patterns",
                            arguments: {
                                agent_type: role,
                                swarm_id: negotiationWithId.swarm_id || undefined,
                                limit: 10
                            }
                        });

                        const analysisText = analysisRes?.content?.[0]?.text;

                        let isSopCandidate = false;
                        if (analysisText) {
                            try {
                                const repaired = jsonrepair(analysisText);
                                const json = JSON.parse(repaired);
                                if (json.sop_candidate) isSopCandidate = true;
                            } catch {
                                if (analysisText.includes('"sop_candidate": true')) isSopCandidate = true;
                            }
                        }

                        if (isSopCandidate) {
                            // 2. Generate SOP
                            const sopRes: any = await hr.callTool({
                                name: "generate_sop_from_patterns",
                                arguments: {
                                    pattern_analysis: analysisText,
                                    title: `SOP for ${role} handling ${strategy.substring(0, 30)}...`,
                                }
                            });

                            const sopOutput = sopRes?.content?.[0]?.text;
                            if (sopOutput && sopOutput.includes("saved to:")) {
                                console.error(`[Dreaming] SOP Generated: ${sopOutput.split('\n')[0]}`);

                                // 3. Link in Brain Graph
                                await brain.callTool({
                                    name: "brain_update_graph",
                                    arguments: {
                                        operation: "add_node",
                                        args: JSON.stringify({
                                            id: `SOP-${role}-${Date.now()}`,
                                            type: "SOP",
                                            properties: {
                                                role: role,
                                                generated_by: "dreaming",
                                                pattern_source: fail.taskId
                                            }
                                        })
                                    }
                                });

                                // 4. Update Memory with Metadata
                                try {
                                    // We delete and re-store to update the metadata, reusing the attempts array from earlier scope
                                    await brain.callTool({
                                        name: "brain_delete_episode",
                                        arguments: { id: fail.id, company: companyId }
                                    });

                                    const updatedOutcomes = { ...negotiationData, sop_generated_from_pattern: true };

                                    // Re-store with updated metadata
                                    await brain.callTool({
                                        name: "brain_store",
                                        arguments: {
                                            id: fail.id,
                                            taskId: fail.taskId,
                                            request: fail.userPrompt,
                                            solution: `[Dreaming Resolved] ${simOutput}`,
                                            company: companyId,
                                            simulation_attempts: JSON.stringify(attempts),
                                            resolved_via_dreaming: true,
                                            dreaming_outcomes: JSON.stringify(updatedOutcomes)
                                        }
                                    });
                                } catch (e) {
                                    console.warn("Failed to update memory with SOP metadata:", e);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn("[Dreaming] Failed to trigger HR loop:", e);
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
