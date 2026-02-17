import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { EpisodicMemory } from "../brain/episodic.js";
import { SemanticGraph } from "../brain/semantic_graph.js";
import { join } from "path";
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";

export class BrainServer {
  public server: McpServer;
  private episodic: EpisodicMemory;
  private semantic: SemanticGraph;
  private sopsDir: string;

  constructor() {
    this.server = new McpServer({
      name: "brain",
      version: "1.0.0",
    });

    this.episodic = new EpisodicMemory();
    this.semantic = new SemanticGraph();
    this.sopsDir = join(process.cwd(), ".agent", "sops");

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
      },
      async ({ taskId, request, solution, artifacts, company }) => {
        let artifactList: string[] = [];
        if (artifacts) {
          try {
            artifactList = JSON.parse(artifacts);
            if (!Array.isArray(artifactList)) artifactList = [];
          } catch {
            artifactList = [];
          }
        }
        await this.episodic.store(taskId, request, solution, artifactList, company);
        return {
          content: [{ type: "text", text: "Memory stored successfully." }],
        };
      }
    );

    this.server.tool(
      "brain_query",
      "Search episodic memory for relevant past experiences.",
      {
        query: z.string().describe("The search query."),
        limit: z.number().optional().default(3).describe("Max number of results."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ query, limit = 3, company }) => {
        const results = await this.episodic.recall(query, limit, company);
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No relevant memories found." }] };
        }
        const text = results
          .map(
            (r) =>
              `[Task: ${r.taskId}]\nTimestamp: ${new Date(r.timestamp).toISOString()}\nRequest: ${r.userPrompt}\nSolution: ${r.agentResponse}\nArtifacts: ${r.artifacts.join(", ") || "None"}`
          )
          .join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
      }
    );

    // Context Management Tools (Long-term Memory)
    this.server.tool(
      "brain_store_context",
      "Store a snapshot of the global context/memory.",
      {
        context: z.string().describe("The JSON string representation of the context."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ context, company }) => {
        // Use a fixed taskId 'global_context' to represent the shared memory state
        await this.episodic.store("global_context", "context_update", context, [], company);
        return {
          content: [{ type: "text", text: "Context stored successfully." }],
        };
      }
    );

    this.server.tool(
      "brain_get_context",
      "Retrieve the latest global context/memory snapshot.",
      {
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ company }) => {
        const result = await this.episodic.retrieve("global_context", company);
        if (result) {
          return {
            content: [{ type: "text", text: result.agentResponse }],
          };
        }
        return {
          content: [{ type: "text", text: "No context found." }],
          isError: true,
        };
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
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Brain MCP Server running on stdio");
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
