import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { fileURLToPath } from "url";
import { EpisodicMemory } from "../../brain/index.js";
import { SemanticGraph } from "../../brain/semantic_graph.js";
import { join } from "path";
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";

export class BrainServer {
  private server: McpServer;
  private episodic: EpisodicMemory;
  private semantic: SemanticGraph;
  private sopsDir: string;
  private app: express.Express;
  private transports = new Map<string, SSEServerTransport>();

  constructor() {
    this.server = new McpServer({
      name: "brain-server",
      version: "1.0.0",
    });

    this.episodic = new EpisodicMemory();
    this.semantic = new SemanticGraph();
    this.sopsDir = join(process.cwd(), ".agent", "sops");

    this.app = express();
    this.app.use(cors());
    // Allow JSON body parsing for POST
    this.app.use(express.json());

    this.setupTools();
  }

  private setupTools() {
    // Episodic Memory Tools
    this.server.tool(
      "store_memory",
      "Store a new episodic memory (user prompt, agent response, artifacts).",
      {
        userPrompt: z.string().describe("The user's original request."),
        agentResponse: z.string().describe("The agent's final response or summary."),
        artifacts: z.string().optional().describe("JSON string array of modified file paths."),
      },
      async ({ userPrompt, agentResponse, artifacts }) => {
        let artifactList: string[] = [];
        if (artifacts) {
          try {
            artifactList = JSON.parse(artifacts);
            if (!Array.isArray(artifactList)) artifactList = [];
          } catch {
            // If simple string, wrap in array? Or ignore?
            // Let's assume input is JSON array string.
            artifactList = [];
          }
        }
        await this.episodic.add(userPrompt, agentResponse, artifactList);
        return {
          content: [{ type: "text", text: "Memory stored successfully." }],
        };
      }
    );

    this.server.tool(
      "query_memory",
      "Search episodic memory for relevant past experiences.",
      {
        query: z.string().describe("The search query."),
        limit: z.number().optional().default(3).describe("Max number of results."),
      },
      async ({ query, limit = 3 }) => {
        const results = await this.episodic.search(query, limit);
        if (results.length === 0) {
          return { content: [{ type: "text", text: "No relevant memories found." }] };
        }
        const text = results
          .map(
            (r) =>
              `[${new Date(r.timestamp).toISOString()}]\nUser: ${r.userPrompt}\nAgent: ${r.agentResponse}\nArtifacts: ${r.artifacts.join(", ") || "None"}`
          )
          .join("\n\n---\n\n");
        return { content: [{ type: "text", text }] };
      }
    );

    // Semantic Graph Tools
    this.server.tool(
      "query_semantic_graph",
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
      "update_semantic_graph",
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
      "get_procedure",
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
    this.app.get("/sse", async (req, res) => {
      const transport = new SSEServerTransport("/message", res);
      await this.server.connect(transport);

      // Store transport by sessionId
      const sessionId = (transport as any).sessionId;
      this.transports.set(sessionId, transport);

      transport.onclose = () => {
        this.transports.delete(sessionId);
      };
    });

    this.app.post("/message", async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = this.transports.get(sessionId);

      if (!transport) {
        res.status(404).send("Session not found");
        return;
      }

      await transport.handlePostMessage(req, res);
    });

    const PORT = process.env.PORT || 3002;
    this.app.listen(PORT, () => {
      console.error(`Brain MCP Server running on port ${PORT}`);
    });
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
