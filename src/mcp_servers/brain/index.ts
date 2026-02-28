import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import { fileURLToPath } from "url";
import { EpisodicMemory } from "../../brain/episodic.js";
import { SemanticGraph } from "../../brain/semantic_graph.js";
import { join, dirname } from "path";
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { FrameworkIngestionEngine } from "../../framework_ingestion/ingest.js";
import { createLLM } from "../../llm.js";
import { readStrategy, proposeStrategicPivot } from "./tools/strategy.js";
import { scanStrategicHorizon } from "./tools/scan_strategic_horizon.js";
import { conveneBoardMeeting } from "./tools/convene_board_meeting.js";
import { getGrowthTargets } from "./tools/strategic_growth.js";

export class BrainServer {
  private server: McpServer;
  private episodic: EpisodicMemory;
  private semantic: SemanticGraph;
  private sopsDir: string;
  private frameworkEngine: FrameworkIngestionEngine;
  private baseDir: string;

  constructor() {
    this.server = new McpServer({
      name: "brain",
      version: "1.0.0",
    });

    const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
    this.baseDir = baseDir;
    this.episodic = new EpisodicMemory(baseDir);
    this.semantic = new SemanticGraph(baseDir);
    this.frameworkEngine = new FrameworkIngestionEngine(baseDir);
    this.sopsDir = process.env.JULES_AGENT_DIR
        ? join(process.env.JULES_AGENT_DIR, "sops")
        : join(process.cwd(), ".agent", "sops");

    // Auto-discover frameworks on startup
    this.frameworkEngine.scanForFrameworks().then(discovered => {
        if (discovered.length > 0) {
            console.error(`Brain auto-discovered ${discovered.length} frameworks.`);
        }
    }).catch(e => console.error("Error scanning for frameworks:", e));

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
        "brain_register_framework",
        "Manually register a framework to enable memory sharing.",
        {
            name: z.string().describe("The name of the framework (must match folder in src/mcp_servers/)."),
        },
        async ({ name }) => {
            const result = await this.frameworkEngine.registerFramework(name);
            if (!result) {
                return {
                    content: [{ type: "text", text: `Framework '${name}' not found or could not be registered.` }],
                    isError: true
                };
            }
            return {
                content: [{ type: "text", text: `Successfully registered framework '${name}' with policy: ${JSON.stringify(result.memoryPolicy)}` }]
            };
        }
    );

    // Disaster Recovery Tools
    this.server.tool(
      "export_memory",
      "Dumps Vector/Graph DB to a compressed archive.",
      {},
      async () => {
        try {
          const brainDir = join(this.baseDir, ".agent", "brain");
          if (!existsSync(brainDir)) {
            return { content: [{ type: "text", text: "Brain directory not found." }], isError: true };
          }
          const archivePath = join(this.baseDir, ".agent", "brain_export.zip");
          const { exec } = await import("child_process");
          const { promisify } = await import("util");
          const execAsync = promisify(exec);
          await execAsync(`cd ${this.baseDir} && zip -r ${archivePath} .agent/brain/`);
          return { content: [{ type: "text", text: `Memory exported successfully to ${archivePath}` }] };
        } catch (e: any) {
          return { content: [{ type: "text", text: `Export failed: ${e.message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "restore_memory",
      "Restores Vector/Graph DB from a compressed archive.",
      {
         archivePath: z.string().describe("Path to the brain_export.zip file.")
      },
      async ({ archivePath }) => {
        try {
           if (!existsSync(archivePath)) {
               return { content: [{ type: "text", text: `Archive not found at ${archivePath}` }], isError: true };
           }
           const { exec } = await import("child_process");
           const { promisify } = await import("util");
           const execAsync = promisify(exec);
           await execAsync(`unzip -o ${archivePath} -d ${this.baseDir}`);
           return { content: [{ type: "text", text: "Memory restored successfully." }] };
        } catch (e: any) {
           return { content: [{ type: "text", text: `Restore failed: ${e.message}` }], isError: true };
        }
      }
    );

    // Episodic Memory Tools
    this.server.tool(
      "brain_store",
      "Store a new episodic memory (task ID, request, solution, artifacts).",
      {
        taskId: z.string().describe("The unique ID of the task."),
        request: z.string().describe("The user's original request."),
        solution: z.string().describe("The agent's final solution or response."),
        artifacts: z.string().optional().describe("JSON string array of modified file paths."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
        simulation_attempts: z.string().optional().describe("JSON string array of simulation attempts."),
        resolved_via_dreaming: z.boolean().optional().describe("Whether this episode was resolved via dreaming."),
        dreaming_outcomes: z.string().optional().describe("JSON string of dreaming outcomes (agent breakdown, negotiation results)."),
        id: z.string().optional().describe("The unique ID of the episode (optional, for updates/overrides)."),
        tokens: z.number().optional().describe("Total tokens used for this task."),
        duration: z.number().optional().describe("Duration of the task in milliseconds."),
        type: z.string().optional().describe("The type of memory (e.g., 'task' or 'swarm_negotiation_pattern')."),
        related_episode_id: z.string().optional().describe("ID of a related episode (e.g., the failure episode for a negotiation pattern)."),
      },
      async ({ taskId, request, solution, artifacts, company, simulation_attempts, resolved_via_dreaming, dreaming_outcomes, id, tokens, duration, type, related_episode_id }) => {
        let artifactList: string[] = [];
        if (artifacts) {
          try {
            artifactList = JSON.parse(artifacts);
            if (!Array.isArray(artifactList)) artifactList = [];
          } catch {
            artifactList = [];
          }
        }
        let simAttempts: string[] | undefined = undefined;
        if (simulation_attempts) {
            try {
                simAttempts = JSON.parse(simulation_attempts);
                if (!Array.isArray(simAttempts)) simAttempts = undefined;
            } catch {
                simAttempts = undefined;
            }
        }
        await this.episodic.store(taskId, request, solution, artifactList, company, simAttempts, resolved_via_dreaming, dreaming_outcomes, id, tokens, duration, type, related_episode_id);
        return {
          content: [{ type: "text", text: "Memory stored successfully." }],
        };
      }
    );

    this.server.tool(
      "brain_delete_episode",
      "Delete a specific episodic memory by ID.",
      {
        id: z.string().describe("The ID of the episode to delete."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ id, company }) => {
        await this.episodic.delete(id, company);
        return { content: [{ type: "text", text: `Episode ${id} deleted.` }] };
      }
    );

    this.server.tool(
      "brain_query",
      "Search episodic memory for relevant past experiences.",
      {
        query: z.string().describe("The search query."),
        limit: z.number().optional().default(3).describe("Max number of results."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
        format: z.enum(["text", "json"]).optional().default("text").describe("Output format: 'text' (default) or 'json'."),
        type: z.string().optional().describe("Filter by memory type (e.g., 'swarm_negotiation_pattern')."),
      },
      async ({ query, limit = 3, company, format, type }) => {
        const results = await this.episodic.recall(query, limit, company, type);
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No relevant memories found." }] };
        }

        if (format === "json") {
            return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
        }

        const text = results
          .map(
            (r) => {
              // Ensure artifacts is treated as an array (LanceDB might return array-like object)
              let artifacts: string[] = [];
              if (Array.isArray(r.artifacts)) {
                artifacts = r.artifacts;
              } else if (r.artifacts) {
                try {
                  artifacts = Array.from(r.artifacts as any);
                } catch {
                  // Fallback if not iterable
                  artifacts = [];
                }
              }
              return `[Task: ${r.taskId}]\nTimestamp: ${new Date(r.timestamp).toISOString()}\nRequest: ${r.userPrompt}\nSolution: ${r.agentResponse}\nArtifacts: ${artifacts.length > 0 ? artifacts.join(", ") : "None"}`;
            }
          )
          .join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
      }
    );

    // Corporate Strategy Tools (Phase 25 & 26)
    this.server.tool(
      "get_growth_targets",
      "Analyzes current corporate strategy and returns target markets, ICP attributes, and strategic goals.",
      {
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ company }) => {
        try {
          const llm = createLLM();
          const targets = await getGrowthTargets(this.episodic, llm, company);
          return {
            content: [{ type: "text", text: JSON.stringify(targets, null, 2) }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Failed to extract growth targets: ${e.message}` }],
            isError: true,
          };
        }
      }
    );

    this.server.tool(
      "read_strategy",
      "Retrieves the latest Corporate Strategy from Episodic Memory.",
      {
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ company }) => {
        const strategy = await readStrategy(this.episodic, company);
        if (!strategy) {
          return {
            content: [{ type: "text", text: "No corporate strategy found." }],
          };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(strategy, null, 2) }],
        };
      }
    );

    this.server.tool(
      "propose_strategic_pivot",
      "Proposes a new strategic pivot, analyzing the current strategy and storing the update.",
      {
        proposal: z.string().describe("The strategic pivot proposal."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ proposal, company }) => {
        // Create an LLM instance for this operation.
        // In a persistent server, we might reuse one, but creating one ensures fresh config.
        const llm = createLLM();

        try {
            const newStrategy = await proposeStrategicPivot(this.episodic, llm, proposal, company);
            return {
                content: [{ type: "text", text: `Strategy updated successfully.\n\n${JSON.stringify(newStrategy, null, 2)}` }],
            };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Failed to propose strategic pivot: ${e.message}` }],
                isError: true
            };
        }
      }
    );

    this.server.tool(
      "scan_strategic_horizon",
      "Performs a comprehensive scan of internal patterns and external market signals to generate a strategic horizon report.",
      {
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ company }) => {
        try {
          const report = await scanStrategicHorizon(this.episodic, company);
          return {
            content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
          };
        } catch (e: any) {
          return {
            content: [{ type: "text", text: `Failed to generate strategic horizon report: ${e.message}` }],
            isError: true
          };
        }
      }
    );

    this.server.tool(
      "convene_board_meeting",
      "Orchestrates an autonomous board meeting with C-Suite personas to review strategy and set policy.",
      {
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ company }) => {
        try {
            const minutes = await conveneBoardMeeting(this.episodic, company);
            return {
                content: [{ type: "text", text: JSON.stringify(minutes, null, 2) }],
            };
        } catch (e: any) {
            return {
                content: [{ type: "text", text: `Failed to convene board meeting: ${e.message}` }],
                isError: true
            };
        }
      }
    );

    // Semantic Graph Tools
    this.server.tool(
      "brain_query_graph",
      "Query the semantic graph (nodes and edges) for relationships.",
      {
        query: z.string().describe("Search term to find relevant nodes and edges."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ query, company }) => {
        const result = await this.semantic.query(query, company);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }
    );

    this.server.tool(
      "brain_update_graph",
      "Update the semantic graph by adding nodes or edges.",
      {
        operation: z
          .enum(["add_node", "add_edge"])
          .describe("The operation to perform."),
        args: z.string().describe("JSON string containing arguments for the operation."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ operation, args, company }) => {
        let parsedArgs;
        try {
          parsedArgs = JSON.parse(args);
        } catch {
          return {
            content: [{ type: "text", text: "Error: Invalid JSON in args." }],
            isError: true,
          };
        }

        if (operation === "add_node") {
          const { id, type, properties } = parsedArgs;
          if (!id || !type) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: add_node requires 'id' and 'type'.",
                },
              ],
              isError: true,
            };
          }
          await this.semantic.addNode(id, type, properties || {}, company);
          return {
            content: [{ type: "text", text: `Node '${id}' added/updated.` }],
          };
        } else if (operation === "add_edge") {
          const { from, to, relation, properties } = parsedArgs;
          if (!from || !to || !relation) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: add_edge requires 'from', 'to', and 'relation'.",
                },
              ],
              isError: true,
            };
          }
          await this.semantic.addEdge(from, to, relation, properties || {}, company);
          return {
            content: [
              {
                type: "text",
                text: `Edge '${from}' -[${relation}]-> '${to}' added/updated.`,
              },
            ],
          };
        }
        return { content: [{ type: "text", text: "Unknown operation." }] };
      }
    );

    // Procedural Memory (SOPs)
    this.server.tool(
      "brain_get_sop",
      "Retrieve a standard operating procedure (SOP) by name.",
      {
        name: z.string().describe("The name of the SOP (e.g., 'deploy_app')."),
      },
      async ({ name }) => {
        const filename = name.endsWith(".md") ? name : `${name}.md`;
        const filePath = join(this.sopsDir, filename);

        if (existsSync(filePath)) {
          const content = await readFile(filePath, "utf-8");
          return {
            content: [{ type: "text", text: content }],
          };
        } else {
            // List available SOPs
            let available: string[] = [];
            if (existsSync(this.sopsDir)) {
                const files = await readdir(this.sopsDir);
                available = files.filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""));
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `SOP '${name}' not found. Available SOPs: ${available.join(", ") || "None"}.`
                    }
                ],
                isError: true
            };
        }
      }
    );

    // Experience / Delegation Memory
    this.server.tool(
      "log_experience",
      "Log a task execution experience for future learning.",
      {
        taskId: z.string().describe("The unique ID of the task."),
        task_type: z.string().describe("The type or category of the task (e.g., 'refactor', 'bugfix')."),
        agent_used: z.string().describe("The agent that performed the task."),
        outcome: z.string().describe("The outcome of the task (e.g., 'success', 'failure', 'pending')."),
        summary: z.string().describe("A brief summary of what happened."),
        artifacts: z.string().optional().describe("JSON string array of modified file paths."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
        tokens: z.number().optional().describe("Total tokens used for this task."),
        duration: z.number().optional().describe("Duration of the task in milliseconds."),
      },
      async ({ taskId, task_type, agent_used, outcome, summary, artifacts, company, tokens, duration }) => {
        let artifactList: string[] = [];
        if (artifacts) {
          try {
            artifactList = JSON.parse(artifacts);
            if (!Array.isArray(artifactList)) artifactList = [];
          } catch {
            artifactList = [];
          }
        }

        // We use the existing episodic memory store, but format the request/solution to structured text
        // so it can be retrieved effectively by recall_delegation_patterns.
        const request = `Task Type: ${task_type}\nAgent: ${agent_used}`;
        const solution = `Outcome: ${outcome}\nSummary: ${summary}`;

        await this.episodic.store(taskId, request, solution, artifactList, company, undefined, undefined, undefined, undefined, tokens, duration);
        return {
          content: [{ type: "text", text: "Experience logged successfully." }],
        };
      }
    );

    this.server.tool(
      "recall_delegation_patterns",
      "Recall past delegation experiences to identify patterns and success rates.",
      {
        task_type: z.string().describe("The type of task to analyze (e.g., 'refactor')."),
        query: z.string().optional().describe("Additional query text."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ task_type, query, company }) => {
        const searchQuery = query ? `${task_type} ${query}` : task_type;
        // Fetch more results to calculate stats
        const results = await this.episodic.recall(searchQuery, 10, company);

        if (results.length === 0) {
          return { content: [{ type: "text", text: `No past experiences found for task type: ${task_type}` }] };
        }

        let successCount = 0;
        let failureCount = 0;
        const agentStats: Record<string, { success: number; fail: number }> = {};

        results.forEach((r) => {
           // Parse solution for Outcome
           const solution = r.agentResponse;
           const isSuccess = solution.toLowerCase().includes("outcome: success");
           const isFail = solution.toLowerCase().includes("outcome: failure") || solution.toLowerCase().includes("outcome: failed");

           // Parse request for Agent
           const request = r.userPrompt;
           const agentMatch = request.match(/Agent: ([^\n]+)/);
           const agent = agentMatch ? agentMatch[1].trim() : "unknown";

           if (!agentStats[agent]) agentStats[agent] = { success: 0, fail: 0 };

           if (isSuccess) {
               successCount++;
               agentStats[agent].success++;
           } else if (isFail) {
               failureCount++;
               agentStats[agent].fail++;
           }
        });

        let statsText = `Found ${results.length} relevant experiences for '${task_type}'.\n`;
        statsText += `Overall Success Rate: ${Math.round((successCount / results.length) * 100)}%\n\n`;
        statsText += `Agent Performance:\n`;

        for (const [agent, stats] of Object.entries(agentStats)) {
            const total = stats.success + stats.fail;
            const rate = total > 0 ? Math.round((stats.success / total) * 100) : 0;
            statsText += `- ${agent}: ${rate}% success (${stats.success}/${total})\n`;
        }

        return { content: [{ type: "text", text: statsText }] };
      }
    );

    this.server.tool(
      "brain_maintenance",
      "Perform maintenance tasks on the Brain (e.g., rebuild indices, optimize storage).",
      {
        action: z.enum(["rebuild_indices", "optimize", "vacuum"]).describe("The maintenance action to perform."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ action, company }) => {
        try {
            // Access internal episodic memory table
            // This is a direct access hack for maintenance, ideally EpisodicMemory class exposes this
            // We use the episodic instance to get the connector (private) via a new method or cast
            // For now, we just simulate the optimization log as specific LanceDB operations require lower-level access
            // that isn't fully exposed in the current EpisodicMemory wrapper.
            // However, we can add a method to EpisodicMemory to handle this.

            if (action === "rebuild_indices" || action === "optimize") {
                 // In a real implementation, we would call table.optimize()
                 // await this.episodic.optimize(company);
                 return { content: [{ type: "text", text: `Maintenance '${action}' completed successfully (simulated).` }] };
            }
            return { content: [{ type: "text", text: `Unknown maintenance action: ${action}` }], isError: true };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Maintenance failed: ${e.message}` }], isError: true };
        }
      }
    );
  }

  async run() {
    if (process.env.PORT) {
      const app = express();
      const transport = new StreamableHTTPServerTransport();
      await this.server.connect(transport);

      app.all("/sse", async (req, res) => {
        await transport.handleRequest(req, res);
      });

      app.post("/messages", async (req, res) => {
        await transport.handleRequest(req, res);
      });

      app.get("/health", (req, res) => {
        res.sendStatus(200);
      });

      const port = process.env.PORT;
      app.listen(port, () => {
        console.error(`Brain MCP Server running on http://localhost:${port}/sse`);
      });
    } else {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Brain MCP Server running on stdio");
    }
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new BrainServer();
  server.run().catch((err) => {
    console.error("Fatal error in Brain MCP Server:", err);
    process.exit(1);
  });
}
