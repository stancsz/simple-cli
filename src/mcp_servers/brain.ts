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
  private server: McpServer;
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
      "Store a new episodic memory (task ID, request, solution, artifacts, tags).",
      {
        taskId: z.string().describe("The unique ID of the task."),
        request: z.string().describe("The user's original request."),
        solution: z.string().describe("The agent's final solution or response."),
        artifacts: z.string().optional().describe("JSON string array of modified file paths."),
        tags: z.string().optional().describe("JSON string array of tags."),
      },
      async ({ taskId, request, solution, artifacts, tags }) => {
        let artifactList: string[] = [];
        if (artifacts) {
          try {
            artifactList = JSON.parse(artifacts);
            if (!Array.isArray(artifactList)) artifactList = [];
          } catch {
            artifactList = [];
          }
        }
        let tagList: string[] = [];
        if (tags) {
            try {
                tagList = JSON.parse(tags);
                if (!Array.isArray(tagList)) tagList = [];
            } catch {
                tagList = [];
            }
        }
        await this.episodic.store(taskId, request, solution, artifactList, tagList);
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
        tags: z.string().optional().describe("JSON string array of tags to filter by."),
        min_timestamp: z.number().optional().describe("Minimum timestamp (ms) to filter results."),
      },
      async ({ query, limit = 3, tags, min_timestamp }) => {
        let tagList: string[] = [];
        if (tags) {
            try {
                tagList = JSON.parse(tags);
                if (!Array.isArray(tagList)) tagList = [];
            } catch {
                tagList = [];
            }
        }
        const results = await this.episodic.recall(query, limit, { tags: tagList, minTimestamp: min_timestamp });
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No relevant memories found." }] };
        }
        const text = results
          .map(
            (r) =>
              `[Task: ${r.taskId}]\nTimestamp: ${new Date(r.timestamp).toISOString()}\nRequest: ${r.userPrompt}\nSolution: ${r.agentResponse}\nTags: ${r.tags?.join(", ") || "None"}\nArtifacts: ${r.artifacts.join(", ") || "None"}`
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
      },
      async ({ query }) => {
        const result = await this.semantic.query(query);
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
      },
      async ({ operation, args }) => {
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
          await this.semantic.addNode(id, type, properties || {});
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
          await this.semantic.addEdge(from, to, relation, properties || {});
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
