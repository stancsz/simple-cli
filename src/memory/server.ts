import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { indexProject } from "./indexer.js";
import { searchMemory } from "./search.js";

const server = new Server(
  {
    name: "simple-cli-memory",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "index_project",
        description: "Index the current project's TypeScript files for memory.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description:
                "Root path of the project to index (defaults to current working directory).",
            },
          },
        },
      },
      {
        name: "search_project_memory",
        description: "Search the project's memory using semantic search.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The natural language query to search for.",
            },
            limit: {
              type: "number",
              description: "Number of results to return (default: 5).",
            },
          },
          required: ["query"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "index_project") {
    const path = (args as any).path || process.cwd();
    await indexProject(path);
    return {
      content: [
        {
          type: "text",
          text: `Project indexed successfully at ${path}`,
        },
      ],
    };
  }

  if (name === "search_project_memory") {
    const query = (args as any).query;
    const limit = (args as any).limit || 5;
    const results = await searchMemory(query, limit);

    const formattedResults = results
      .map(
        (r) =>
          `File: ${r.chunk.filePath}\nType: ${r.chunk.type}\nLine: ${r.chunk.startLine}-${r.chunk.endLine}\nContent:\n${r.chunk.content}\n`,
      )
      .join("\n---\n");

    return {
      content: [
        {
          type: "text",
          text: formattedResults || "No relevant memory found.",
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Memory MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
