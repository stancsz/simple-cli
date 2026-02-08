import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import pc from 'picocolors';
import { text, isCancel, log, spinner } from '@clack/prompts';
import { createLLM } from './llm.js';
import { MCP } from './mcp.js';
import { LearningManager } from './learnings.js';
import { Skill } from './skills.js';

export interface Message { role: 'user' | 'assistant' | 'system'; content: string; }
export interface Tool { name: string; description: string; execute: (args: any) => Promise<any>; }

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
        const toolDefs = Array.from(tools.values()).map(t => {
            const schema = (t as any).inputSchema;
            if (schema && schema.shape) {
                const args = Object.keys(schema.shape).join(', ');
                return `- ${t.name}(${args}): ${t.description}`;
            }
            return `- ${t.name}: ${t.description}`;
        }).join('\n');
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
    private learningManager: LearningManager;

    constructor(private llm: any, private registry: Registry, private mcp: MCP) {
        this.learningManager = new LearningManager(process.cwd());
    }

    async run(ctx: Context, initialPrompt?: string, options: { interactive: boolean } = { interactive: true }) {
        await this.learningManager.load();
        let input = initialPrompt;
        await this.mcp.init();
        (await this.mcp.getTools()).forEach(t => this.registry.tools.set(t.name, t as any));

        // Ensure tools are loaded for the context cwd
        await this.registry.loadProjectTools(ctx.cwd);

        while (true) {
            if (!input) {
                if (!options.interactive || !process.stdout.isTTY) break;
                const res = await text({ message: pc.cyan('Chat') });
                if (isCancel(res)) break;
                input = res as string;
            }

            ctx.history.push({ role: 'user', content: input });

            // RAG: Inject learnings
            let prompt = await ctx.buildPrompt(this.registry.tools);
            const userHistory = ctx.history.filter(m => m.role === 'user' && !['Continue.', 'Fix the error.'].includes(m.content));
            const lastUserMsg = userHistory[userHistory.length - 1]?.content || '';
            const query = (input && !['Continue.', 'Fix the error.'].includes(input)) ? input : lastUserMsg;

            const learnings = await this.learningManager.search(query);
            if (learnings.length > 0) {
                prompt += `\n\n## Past Learnings\n${learnings.map(l => `- ${l}`).join('\n')}`;
            }

            const response = await this.llm.generate(prompt, ctx.history);
            const { thought, tool, args, message } = response;

            if (thought) log.info(pc.dim(thought));

            if (tool && tool !== 'none') {
                const t = this.registry.tools.get(tool);
                if (t) {
                    const s = spinner();
                    s.start(`Executing ${tool}...`);
                    let toolExecuted = false;
                    try {
                        const result = await t.execute(args);
                        s.stop(`Executed ${tool}`);
                        toolExecuted = true;

                        // Reload tools if create_tool was used
                        if (tool === 'create_tool') {
                            await this.registry.loadProjectTools(ctx.cwd);
                            log.success('Tools reloaded.');
                        }

                        ctx.history.push({ role: 'assistant', content: JSON.stringify(response) });
                        ctx.history.push({ role: 'user', content: `Result: ${JSON.stringify(result)}` });

                        // --- Supervisor Loop (QA & Reflection) ---
                        // "Principal Skinner" enters the room
                        log.step(`[Supervisor] Verifying work from ${tool}...`);

                        let qaPrompt = `Analyze the result of the tool execution: ${JSON.stringify(result)}. Did it satisfy the user's request: "${input || userHistory.pop()?.content}"? If specific files were mentioned (like flask app), check if they exist or look correct based on the tool output.`;

                        // If it was a delegation, be stricter
                        if (tool === 'delegate_cli') {
                            qaPrompt += " Since this was delegated to an external CLI, be extra critical. Does the output explicitly confirm file creation?";
                        }

                        const qaCheck = await this.llm.generate(qaPrompt, [...ctx.history, { role: 'user', content: qaPrompt }]);
                        log.step(`[Supervisor] ${qaCheck.message || qaCheck.thought}`);

                        if (qaCheck.message && qaCheck.message.toLowerCase().includes('fail')) {
                            log.error('[Supervisor] QA FAILED. Asking for retry...');
                            input = "The previous attempt failed. Please retry or fix the issue.";
                        } else {
                            log.success('[Supervisor] QA PASSED. Work verified.');

                            // Store learning ONLY if QA passed
                            const reflectPrompt = "Summarize the successful strategy used here as a concise learning point.";
                            const reflection = await this.llm.generate(reflectPrompt, [...ctx.history, { role: 'user', content: reflectPrompt }]);
                            if (reflection.message) {
                                await this.learningManager.add(input || 'Task', reflection.message);
                            }
                        }

                        input = 'The tool execution was verified. Proceed.';
                        continue;
                    } catch (e: any) {
                        if (!toolExecuted) s.stop(`Error executing ${tool}`);
                        else log.error(`Error during verification: ${e.message}`);

                        ctx.history.push({ role: 'user', content: `Error: ${e.message}` });
                        input = 'Fix the error.';
                        continue;
                    }
                }
            }

            if (message || response.raw) {
                console.log();
                console.log(pc.blue('Agent:'));
                console.log(message || response.raw);
                console.log();
            }
            ctx.history.push({ role: 'assistant', content: message || response.raw });
            input = undefined;
        }
    }
}
