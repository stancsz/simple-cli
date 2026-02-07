import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import pc from 'picocolors';
import { text, isCancel } from '@clack/prompts';
import { createLLM } from './llm.js';
import { MCP } from './mcp.js';

export interface Message { role: 'user' | 'assistant' | 'system'; content: string; }
export interface Tool { name: string; description: string; execute: (args: any) => Promise<any>; }
export interface Skill { name: string; systemPrompt: string; }

async function getRepoMap(cwd: string) {
    const files: string[] = [];
    async function walk(dir: string) {
        const entries = await readdir(dir, { withFileTypes: true });
        for (const e of entries) {
            if (['node_modules', '.git', 'dist'].includes(e.name)) continue;
            const res = join(dir, e.name);
            if (e.isDirectory()) await walk(res);
            else if (['.ts', '.js', '.py', '.md'].includes(res.slice(-3))) files.push(relative(cwd, res));
        }
    }
    try { await walk(cwd); } catch { }
    return files.slice(0, 50).join('\n');
}

export class Context {
    history: Message[] = [];
    activeFiles: Set<string> = new Set();
    cwd: string;
    skill: Skill;

    constructor(cwd: string, skill: Skill) {
        this.cwd = cwd;
        this.skill = skill;
    }

    async buildPrompt(tools: Map<string, Tool>) {
        const repoMap = await getRepoMap(this.cwd);
        const toolDefs = Array.from(tools.values()).map(t => `- ${t.name}: ${t.description}`).join('\n');
        return `${this.skill.systemPrompt}\n\n## Tools\n${toolDefs}\n\n## Repository\n${repoMap}\n\n## Active Files\n${Array.from(this.activeFiles).map(f => relative(this.cwd, f)).join(', ')}`;
    }
}

export class Registry {
    tools: Map<string, Tool> = new Map();

    async loadProjectTools(cwd: string) {
        const dir = join(cwd, '.agent', 'tools');
        if (!existsSync(dir)) return;
        for (const f of await readdir(dir)) {
            if (f.endsWith('.ts') || f.endsWith('.js')) {
                const mod = await import(pathToFileURL(join(dir, f)).href);
                const t = mod.tool || mod.default;
                if (t?.name) this.tools.set(t.name, t);
            }
        }
    }
}

export class Engine {
    constructor(private llm: any, private registry: Registry, private mcp: MCP) { }

    async run(ctx: Context, initialPrompt?: string) {
        let input = initialPrompt;
        await this.mcp.init();
        (await this.mcp.getTools()).forEach(t => this.registry.tools.set(t.name, t as any));

        while (true) {
            if (!input) {
                const res = await text({ message: pc.cyan('Chat') });
                if (isCancel(res)) break;
                input = res as string;
            }

            ctx.history.push({ role: 'user', content: input });
            const response = await this.llm.generate(await ctx.buildPrompt(this.registry.tools), ctx.history);
            const { thought, tool, args, message } = response;

            if (thought) console.log(pc.dim(`💭 ${thought}`));

            if (tool && tool !== 'none') {
                const t = this.registry.tools.get(tool);
                if (t) {
                    console.log(pc.yellow(`⚙ Executing ${tool}...`));
                    try {
                        const result = await t.execute(args);
                        ctx.history.push({ role: 'assistant', content: JSON.stringify(response) });
                        ctx.history.push({ role: 'user', content: `Result: ${JSON.stringify(result)}` });
                        input = 'Continue.';
                        continue;
                    } catch (e: any) {
                        ctx.history.push({ role: 'user', content: `Error: ${e.message}` });
                        input = 'Fix the error.';
                        continue;
                    }
                }
            }

            console.log(`\n${pc.green('🤖')} ${message || response.raw}\n`);
            ctx.history.push({ role: 'assistant', content: message || response.raw });
            input = undefined;
        }
    }
}
