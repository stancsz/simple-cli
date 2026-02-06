import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { loadAllTools } from '../registry.js';
import { z } from 'zod';
import { getContextManager } from '../context.js';
import { createProvider } from '../providers/index.js';

export async function startMCPServer(port: number) {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // Store transports by session ID
  const transports = new Map<string, SSEServerTransport>();

  // Initialize context manager and tools once
  const ctx = getContextManager();
  await ctx.initialize();
  const tools = await loadAllTools();

  app.get('/sse', async (req, res) => {
    console.log('[MCP] New SSE connection request');

    // Create new MCP Server instance for this connection
    const server = new McpServer({
      name: "SimpleCLI Worker",
      version: "1.0.0"
    });

    // Register tools to this server instance
    for (const tool of tools.values()) {
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
            console.log(`[MCP] Executing tool: ${tool.name}`);
            const result = await tool.execute(args as any);
            const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            return {
              content: [{ type: "text", text }]
            };
          } catch (err: any) {
            console.error(`[MCP] Tool error (${tool.name}):`, err);
            return {
              content: [{ type: "text", text: `Error: ${err.message}` }],
              isError: true
            };
          }
        }
      );
    }

    // Add run_agent_task tool (Headless Agent Loop)
    server.tool(
      "run_agent_task",
      "Execute a high-level agent task without spawning a new process",
      {
        prompt: z.string(),
        env: z.record(z.string()).optional()
      },
      async ({ prompt, env }) => {
         console.log(`[MCP] run_agent_task invoked: "${prompt}"`);

         // 1. Initialize Provider
         const provider = createProvider();
         const ctx = getContextManager(); // Re-use global context

         // 2. Add User Message
         ctx.addMessage('user', prompt);

         // 3. Simple Loop (limit to 10 steps for safety in worker mode)
         let steps = 0;
         const maxSteps = 10;
         let finalOutput = '';

         try {
             while (steps < maxSteps) {
                // Generate
                const fullPrompt = await ctx.buildSystemPrompt();
                const history = ctx.getHistory();
                const response = await provider.generateResponse(fullPrompt, history.map(m => ({ role: m.role, content: m.content })));

                const { thought, tool, args, message } = response; // typeLLM response structure

                if (thought) console.log(`[Agent] Thought: ${thought}`);
                finalOutput += `[Thought] ${thought}\n`;

                if (tool && tool !== 'none') {
                    console.log(`[Agent] Tool: ${tool}`);
                    const toolDef = ctx.getTools().get(tool);
                    if (toolDef) {
                        try {
                            const result = await toolDef.execute(args || {});
                            const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
                            ctx.addMessage('assistant', JSON.stringify(response));
                            ctx.addMessage('user', `Tool result: ${resultStr}`);
                            finalOutput += `[Tool: ${tool}] Result: ${resultStr}\n`;
                        } catch (err: any) {
                             ctx.addMessage('user', `Tool error: ${err.message}`);
                             finalOutput += `[Tool: ${tool}] Error: ${err.message}\n`;
                        }
                    } else {
                        ctx.addMessage('user', `Error: Tool ${tool} not found`);
                    }
                    steps++;
                } else {
                    // Final message
                    if (message) {
                        finalOutput += `[Response] ${message}\n`;
                        ctx.addMessage('assistant', message);
                    }
                    break;
                }
             }
         } catch (e: any) {
             finalOutput += `[Fatal Error] ${e.message}\n`;
         }

         return {
            content: [{ type: "text", text: finalOutput }]
         };
      }
    );

    const transport = new SSEServerTransport("/messages", res);
    console.log(`[MCP] Created transport with session ID: ${transport.sessionId}`);

    transports.set(transport.sessionId, transport);

    transport.onclose = () => {
        console.log(`[MCP] Session closed: ${transport.sessionId}`);
        transports.delete(transport.sessionId);
    };

    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    // console.log(`[MCP] POST /messages for session: ${sessionId}`);

    if (!sessionId) {
        res.status(400).send("Missing sessionId parameter");
        return;
    }

    const transport = transports.get(sessionId);
    if (transport) {
        await transport.handlePostMessage(req, res);
    } else {
        console.warn(`[MCP] Session not found: ${sessionId}`);
        res.status(404).send("Session not found");
    }
  });

  const httpServer = app.listen(port, () => {
    console.log(`MCP Server running on port ${port}`);
    console.log(`SSE Endpoint: http://localhost:${port}/sse`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[MCP] Shutting down server...');
    httpServer.close(() => {
        console.log('[MCP] HTTP server closed');
        process.exit(0);
    });

    // Force close after timeout
    setTimeout(() => {
        console.error('[MCP] Forced shutdown');
        process.exit(1);
    }, 5000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
