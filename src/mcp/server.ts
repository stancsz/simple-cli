import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { loadAllTools } from '../registry.js';
import { z } from 'zod';
import { getContextManager } from '../context.js';
import { createProvider } from '../providers/index.js';
import { runGhostLoop } from '../lib/ghost.js';
import net from 'net';

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

  // Ghost Mode: HTTP Endpoint
  app.post('/ghost', async (req, res) => {
    const { prompt } = req.body;
    if (!prompt) {
       res.status(400).send('Missing prompt');
       return;
    }

    console.log(`[Ghost] HTTP request: "${prompt}"`);

    // Set headers for streaming text
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Transfer-Encoding', 'chunked');

    try {
      await runGhostLoop(prompt, ctx, (msg) => {
          res.write(msg + '\n');
      });
    } catch (err: any) {
      res.write(`[Fatal Error] ${err.message}\n`);
    }

    res.end();
  });

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

         let finalOutput = '';
         // Use the shared ghost loop logic
         await runGhostLoop(prompt, ctx, (msg) => {
             finalOutput += msg + '\n';
         }, { env });

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
    console.log(`Ghost Endpoint: http://localhost:${port}/ghost`);
  });

  // Ghost Mode: Socket Listener
  const socketPort = port + 1;
  const socketServer = net.createServer((socket) => {
      console.log('[Socket] New connection');

      let buffer = '';
      let processing = false;
      const queue: string[] = [];

      const processQueue = async () => {
          if (processing) return;
          processing = true;

          while (queue.length > 0) {
              const prompt = queue.shift();
              if (prompt) {
                  socket.write(`[Ghost] Received: ${prompt}\n`);
                  try {
                      await runGhostLoop(prompt, ctx, (msg) => {
                          if (socket.writable) socket.write(msg + '\n');
                      });
                  } catch (err: any) {
                      if (socket.writable) socket.write(`[Error] ${err.message}\n`);
                  }
                  if (socket.writable) socket.write('[Ghost] Done.\n');
              }
          }

          processing = false;
      };

      socket.on('data', (data) => {
          buffer += data.toString();

          if (buffer.includes('\n')) {
              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep the incomplete part

              for (const line of lines) {
                  if (line.trim()) {
                      queue.push(line.trim());
                  }
              }
              processQueue();
          }
      });

      socket.on('error', (err) => {
          console.error('[Socket] Error:', err);
      });
  });

  socketServer.listen(socketPort, () => {
      console.log(`Socket Server running on port ${socketPort}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('[MCP] Shutting down server...');
    httpServer.close(() => {
        console.log('[MCP] HTTP server closed');
        socketServer.close(() => {
             console.log('[Socket] Server closed');
             process.exit(0);
        });
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
