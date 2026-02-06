import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { loadAllTools } from '../registry.js';
import { z } from 'zod';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { getContextManager } from '../context.js';

export async function startMCPServer(port: number) {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // Create MCP Server
  const server = new McpServer({
    name: "SimpleCLI Worker",
    version: "1.0.0"
  });

  // Initialize context manager
  const ctx = getContextManager();
  await ctx.initialize();

  // Load existing tools
  const tools = await loadAllTools();

  // Register tools
  for (const tool of tools.values()) {
    // Extract shape from ZodObject
    let shape = {};
    if (tool.inputSchema instanceof z.ZodObject) {
        shape = tool.inputSchema.shape;
    }

    server.tool(
      tool.name,
      tool.description,
      shape,
      async (args) => {
        try {
          const result = await tool.execute(args as any);
          const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          return {
            content: [{ type: "text", text }]
          };
        } catch (err: any) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
          };
        }
      }
    );
  }

  // Add run_task tool using ContextManager/ToolRegistry directly
  server.tool(
    "run_task",
    "Execute a task using Simple-CLI agent tools directly",
    {
      tool_name: z.string(),
      args: z.record(z.any())
    },
    async ({ tool_name, args }) => {
       try {
         const tool = ctx.getTools().get(tool_name);
         if (!tool) {
            return {
                content: [{ type: "text", text: `Error: Tool ${tool_name} not found` }],
                isError: true
            };
         }

         const result = await tool.execute(args);
         const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
         return {
            content: [{ type: "text", text }]
         };

       } catch (error: any) {
         return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true
         };
       }
    }
  );

  let transport: SSEServerTransport;

  app.get('/sse', async (req, res) => {
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        res.status(404).send("Session not found");
    }
  });

  app.listen(port, () => {
    console.log(`MCP Server running on port ${port}`);
    console.log(`SSE Endpoint: http://localhost:${port}/sse`);
  });
}
