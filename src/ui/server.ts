import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getContextManager } from '../context.js';
import { createProvider } from '../providers/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ServerOptions {
    port: number;
    host: string;
}

export async function startServer(options: ServerOptions) {
    const { port, host } = options;

    // Initialize Simple-CLI core
    const ctx = getContextManager();
    await ctx.initialize();
    const provider = createProvider();

    const server = http.createServer(async (req, res) => {
        // Basic router
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
            return;
        }

        if (req.method === 'POST' && req.url === '/api/chat') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { message } = JSON.parse(body);
                    console.log(`[UI] Received message: ${message}`);
                    if (!message) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Message required' }));
                        return;
                    }

                    // Add message to context
                    ctx.addMessage('user', message);

                    // Get system prompt and history
                    const systemPrompt = await ctx.buildSystemPrompt();
                    const history = ctx.getHistory();

                    // Generate response
                    console.log(`[UI] Generating response with model: ${provider.model}...`);
                    const response = await provider.generateResponse(
                        systemPrompt,
                        history.map(m => ({ role: m.role, content: m.content }))
                    );
                    console.log(`[UI] Response received (${response.length} chars)`);

                    // Parse response
                    const thought = response.match(/<thought>([\s\S]*?)<\/thought>/)?.[1]?.trim();
                    const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);

                    let action = { tool: 'none', message: '', args: {} };
                    if (jsonMatch) {
                        try {
                            const { jsonrepair } = await import('jsonrepair');
                            action = JSON.parse(jsonrepair(jsonMatch[0]));
                        } catch { /* ignore */ }
                    }

                    const messageText = action.message ||
                        response.replace(/<thought>[\s\S]*?<\/thought>/g, '').replace(/\{[\s\S]*"tool"[\s\S]*\}/g, '').trim() ||
                        (action.tool !== 'none' ? `Executing ${action.tool}...` : 'I have processed your request.');

                    // Update context with assistant response
                    ctx.addMessage('assistant', response);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        message: messageText,
                        thought: thought || '',
                        action
                    }));
                } catch (error) {
                    console.error('[UI] Chat error:', error);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: (error as Error).message }));
                }
            });
            return;
        }

        if (req.method === 'POST' && req.url === '/api/execute') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const { tool, args } = JSON.parse(body);
                    console.log(`[UI] Executing tool: ${tool}`);

                    const tools = ctx.getTools();
                    const t = tools.get(tool);

                    if (!t) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: `Tool ${tool} not found` }));
                        return;
                    }

                    const result = await t.execute(args);
                    const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

                    // Add result to history so next LLM call knows it's done
                    ctx.addMessage('user', `Tool result: ${resultStr}`);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ result: resultStr }));
                } catch (error) {
                    console.error('[UI] Execution error:', error);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: (error as Error).message }));
                }
            });
            return;
        }

        // 404
        res.writeHead(404);
        res.end('Not Found');
    });

    server.listen(port, host, () => {
        console.log(`\n🚀 Simple-CLI UI running at http://${host}:${port}`);
        console.log(`   Press Ctrl+C to stop\n`);
    });
}
