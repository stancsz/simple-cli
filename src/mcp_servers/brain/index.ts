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

export class BrainServer {
  private server: McpServer;
  private episodic: EpisodicMemory;
  private semantic: SemanticGraph;
  private sopsDir: string;

  constructor() {
    this.server = new McpServer({
      name: "brain",
      version: "1.0.0",
    });

    const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
    this.episodic = new EpisodicMemory(baseDir);
    this.semantic = new SemanticGraph(baseDir);
    this.sopsDir = process.env.JULES_AGENT_DIR
        ? join(process.env.JULES_AGENT_DIR, "sops")
        : join(process.cwd(), ".agent", "sops");

    this.setupTools();
  }

  private setupTools() {
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
        id: z.string().optional().describe("The unique ID of the episode (optional, for updates/overrides)."),
      },
      async ({ taskId, request, solution, artifacts, company, simulation_attempts, resolved_via_dreaming, id }) => {
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
        await this.episodic.store(taskId, request, solution, artifactList, company, simAttempts, resolved_via_dreaming, id);
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
      },
      async ({ query, limit = 3, company, format }) => {
        const results = await this.episodic.recall(query, limit, company);
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
      },
      async ({ taskId, task_type, agent_used, outcome, summary, artifacts, company }) => {
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

        await this.episodic.store(taskId, request, solution, artifactList, company);
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
