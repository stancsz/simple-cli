import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { loadAllTools } from '../registry.js';
import { z } from 'zod';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

export async function startMCPServer(port: number) {
  const app = express();
  app.use(cors());
  app.use(bodyParser.json());

  // Create MCP Server
  const server = new McpServer({
    name: "SimpleCLI Worker",
    version: "1.0.0"
  });

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

  // Add run_task tool
  server.tool(
    "run_task",
    "Execute a task using Simple-CLI agent",
    {
      prompt: z.string(),
      env: z.record(z.string()).optional()
    },
    async ({ prompt, env }) => {
       return new Promise((resolve) => {
         const __filename = fileURLToPath(import.meta.url);
         const __dirname = dirname(__filename);

         const isTs = __filename.endsWith('.ts');
         const cliPath = isTs
            ? join(__dirname, '..', 'cli.ts')
            : join(__dirname, '..', 'cli.js');

         const args = ['--yolo', prompt];
         // Pass env
         const childEnv = { ...process.env, ...env, SIMPLE_CLI_WORKER: 'remote' };

         const cmd = isTs ? 'npx' : 'node';
         const cmdArgs = isTs ? ['tsx', cliPath, ...args] : [cliPath, ...args];

         console.log(`[MCP] Spawning: ${cmd} ${cmdArgs.join(' ')}`);

         const child = spawn(cmd, cmdArgs, {
            env: childEnv,
            cwd: process.cwd()
         });

         let output = '';
         child.stdout.on('data', (d) => output += d.toString());
         child.stderr.on('data', (d) => output += d.toString());

         child.on('close', (code) => {
            resolve({
                content: [{ type: "text", text: output }]
            });
         });
       });
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
