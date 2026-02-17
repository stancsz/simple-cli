import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../brain/episodic.js";
import { SemanticGraph } from "../../brain/semantic_graph.js";
import { join } from "path";
import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";

export function setupBrainTools(
  server: McpServer,
  episodic: EpisodicMemory,
  semantic: SemanticGraph,
  sopsDir: string
) {
  // --- Episodic Memory Tools ---

  // Helper for storing memory
  const storeMemory = async ({ taskId, request, solution, artifacts, company }: any) => {
    let artifactList: string[] = [];
    if (artifacts) {
      if (typeof artifacts === "string") {
          try {
            const parsed = JSON.parse(artifacts);
            if (Array.isArray(parsed)) artifactList = parsed;
          } catch {
            artifactList = [];
          }
      } else if (Array.isArray(artifacts)) {
          artifactList = artifacts;
      }
    }
    await episodic.store(taskId, request, solution, artifactList, company);
    return {
      content: [{ type: "text", text: "Memory stored successfully." }],
    };
  };

  server.tool(
    "brain_store",
    "Store a new episodic memory (task ID, request, solution, artifacts).",
    {
      taskId: z.string().describe("The unique ID of the task."),
      request: z.string().describe("The user's original request."),
      solution: z.string().describe("The agent's final solution or response."),
      artifacts: z.string().optional().describe("JSON string array of modified file paths."),
      company: z.string().optional().describe("The company/client identifier for namespacing."),
    },
    storeMemory
  );

  // Alias for better readability/discovery
  server.tool(
    "store_memory",
    "Alias for brain_store: Store a new episodic memory.",
    {
        taskId: z.string().describe("The unique ID of the task."),
        request: z.string().describe("The user's original request."),
        solution: z.string().describe("The agent's final solution or response."),
        artifacts: z.string().optional().describe("JSON string array of modified file paths."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
    },
    storeMemory
  );

  // Helper for querying memory
  const queryMemory = async ({ query, limit = 3, company }: any) => {
    const results = await episodic.recall(query, limit, company);
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
  };

  server.tool(
    "brain_query",
    "Search episodic memory for relevant past experiences.",
    {
      query: z.string().describe("The search query."),
      limit: z.number().optional().default(3).describe("Max number of results."),
      company: z.string().optional().describe("The company/client identifier for namespacing."),
    },
    queryMemory
  );

  // Alias
  server.tool(
    "query_memory",
    "Alias for brain_query: Search episodic memory for relevant past experiences.",
    {
      query: z.string().describe("The search query."),
      limit: z.number().optional().default(3).describe("Max number of results."),
      company: z.string().optional().describe("The company/client identifier for namespacing."),
    },
    queryMemory
  );


  // --- Semantic Graph Tools ---

  server.tool(
    "brain_query_graph",
    "Query the semantic graph (nodes and edges) for relationships.",
    {
      query: z.string().describe("Search term to find relevant nodes and edges."),
      company: z.string().optional().describe("The company/client identifier for namespacing."),
    },
    async ({ query, company }) => {
      try {
        const result = await semantic.query(query, company);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (e: any) {
         return {
            content: [{ type: "text", text: `Error querying graph: ${e.message}` }],
            isError: true
         };
      }
    }
  );

  server.tool(
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

      try {
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
            await semantic.addNode(id, type, properties || {}, company);
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
            await semantic.addEdge(from, to, relation, properties || {}, company);
            return {
              content: [
                {
                  type: "text",
                  text: `Edge '${from}' -[${relation}]-> '${to}' added/updated.`,
                },
              ],
            };
          }
      } catch(e: any) {
          return {
             content: [{ type: "text", text: `Error updating graph: ${e.message}` }],
             isError: true
          };
      }
      return { content: [{ type: "text", text: "Unknown operation." }] };
    }
  );

  // --- Procedural Memory (SOPs) ---

  server.tool(
    "brain_get_sop",
    "Retrieve a standard operating procedure (SOP) by name.",
    {
      name: z.string().describe("The name of the SOP (e.g., 'deploy_app')."),
    },
    async ({ name }) => {
      const filename = name.endsWith(".md") ? name : `${name}.md`;
      const filePath = join(sopsDir, filename);

      if (existsSync(filePath)) {
        try {
            const content = await readFile(filePath, "utf-8");
            return {
              content: [{ type: "text", text: content }],
            };
        } catch (e: any) {
             return {
                content: [{ type: "text", text: `Error reading SOP file: ${e.message}` }],
                isError: true
             };
        }
      } else {
          // List available SOPs
          let available: string[] = [];
          if (existsSync(sopsDir)) {
              try {
                  const files = await readdir(sopsDir);
                  available = files.filter(f => f.endsWith(".md")).map(f => f.replace(".md", ""));
              } catch (e) {
                  // Ignore error listing directory
              }
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
