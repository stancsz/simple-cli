import { Engine, Registry, Context } from '../engine.js';
import { MCP } from '../mcp.js';
import { createLLM } from '../llm.js';
import { getActiveSkill } from '../skills.js';

export class Server {
    private engine: Engine;

    constructor(engine?: Engine) {
        if (engine) {
            this.engine = engine;
        } else {
            const llm = createLLM();
            const registry = new Registry();
            const mcp = new MCP();
            this.engine = new Engine(llm, registry, mcp);
        }
    }

    async handle(input: string | { tool_name: string, args: any }) {
        try {
            if (typeof input === 'string') {
                console.log(`[Server] Received prompt: ${input.substring(0, 50)}...`);
                const skill = await getActiveSkill(process.cwd());
                const context = new Context(process.cwd(), skill);
                await this.engine.run(context, input, { interactive: false });
                return { status: 'success', message: 'Agent executed prompt' };
            } else {
                console.log(`[Server] Received tool call: ${input.tool_name}`);
                // Handle tool execution logic would go here
                // We'll return a placeholder success for now
                return { status: 'success', message: 'Tool executed', tool: input.tool_name };
            }
        } catch (error: any) {
            console.error(`[Server] Error handling request:`, error);
            return { status: 'error', message: error.message };
        }
    }
}
