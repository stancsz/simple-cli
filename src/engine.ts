import { readFile, writeFile, readdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, relative, resolve } from 'path';
import { pathToFileURL } from 'url';
import readline from 'readline';
import pc from 'picocolors';
import { text, isCancel, log, spinner } from '@clack/prompts';
import { createLLM } from './llm.js';
import { MCP } from './mcp.js';
import { LearningManager } from './learnings.js';
import { Skill } from './skills.js';

export interface Message { role: 'user' | 'assistant' | 'system'; content: string; }
export interface Tool { name: string; description: string; execute: (args: any, options?: { signal?: AbortSignal }) => Promise<any>; }

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

        if (process.stdin.isTTY) {
             readline.emitKeypressEvents(process.stdin);
        }

        while (true) {
            if (!input) {
                if (!options.interactive || !process.stdout.isTTY) break;
                const res = await text({ message: pc.cyan('Chat') });
                if (isCancel(res)) break;
                input = res as string;
            }

            ctx.history.push({ role: 'user', content: input });

            const controller = new AbortController();
            const signal = controller.signal;
            let aborted = false;

            const onKeypress = (str: string, key: any) => {
                if (key.name === 'escape') {
                    log.warn('Interrupted by user.');
                    aborted = true;
                    controller.abort();
                }
            };

            if (process.stdin.isTTY) {
                process.stdin.setRawMode(true);
                process.stdin.on('keypress', onKeypress);
            }

            try {
                // RAG: Inject learnings
                let prompt = await ctx.buildPrompt(this.registry.tools);
                const userHistory = ctx.history.filter(m => m.role === 'user' && !['Continue.', 'Fix the error.'].includes(m.content));
                const lastUserMsg = userHistory[userHistory.length - 1]?.content || '';
                const query = (input && !['Continue.', 'Fix the error.'].includes(input)) ? input : lastUserMsg;

                const learnings = await this.learningManager.search(query);
                if (learnings.length > 0) {
                    prompt += `\n\n## Past Learnings\n${learnings.map(l => `- ${l}`).join('\n')}`;
                }

                // Pass signal to LLM
                const response = await this.llm.generate(prompt, ctx.history, signal);
                const { thought, tool, args, message, tools } = response;

                if (thought) log.info(pc.dim(thought));

                // Determine execution list
                const executionList = tools && tools.length > 0
                    ? tools
                    : (tool && tool !== 'none' ? [{ tool, args }] : []);

                if (executionList.length > 0) {
                    let allExecuted = true;
                    for (const item of executionList) {
                        if (signal.aborted) break;

                        const tName = item.tool;
                        const tArgs = item.args;
                        const t = this.registry.tools.get(tName);

                        if (t) {
                            const s = spinner();
                            s.start(`Executing ${tName}...`);
                            let toolExecuted = false;
                            let qaSpinner: any = null;
                            try {
                                const result = await t.execute(tArgs, { signal });
                                s.stop(`Executed ${tName}`);
                                toolExecuted = true;

                                // Reload tools if create_tool was used
                                if (tName === 'create_tool') {
                                    await this.registry.loadProjectTools(ctx.cwd);
                                    log.success('Tools reloaded.');
                                }

                                // Add individual tool execution to history to keep context updated
                                // We mock a single tool response for history consistency
                                ctx.history.push({
                                    role: 'assistant',
                                    content: JSON.stringify({ thought: '', tool: tName, args: tArgs })
                                });
                                ctx.history.push({ role: 'user', content: `Result: ${JSON.stringify(result)}` });

                                // --- Supervisor Loop (QA & Reflection) ---
                                qaSpinner = spinner();
                                qaSpinner.start(`[Supervisor] Verifying work from ${tName}...`);

                                let qaPrompt = `Analyze the result of the tool execution: ${JSON.stringify(result)}. Did it satisfy the user's request: "${input || userHistory.pop()?.content}"? If specific files were mentioned (like flask app), check if they exist or look correct based on the tool output.`;

                                if (tName === 'delegate_cli') {
                                    qaPrompt += " Since this was delegated to an external CLI, be extra critical. Does the output explicitly confirm file creation?";
                                }

                                const qaCheck = await this.llm.generate(qaPrompt, [...ctx.history, { role: 'user', content: qaPrompt }], signal);

                                if (qaCheck.message && qaCheck.message.toLowerCase().includes('fail')) {
                                    qaSpinner.stop(`[Supervisor] QA FAILED`);
                                    log.error(`[Supervisor] Reason: ${qaCheck.message || qaCheck.thought}`);
                                    log.error(`[Supervisor] Asking for retry...`);
                                    input = "The previous attempt failed. Please retry or fix the issue.";
                                    allExecuted = false;
                                    break; // Stop batch execution on failure
                                } else {
                                    qaSpinner.stop('[Supervisor] Verified');
                                    // Optional: Learnings can be aggregated or skipped for batch to save tokens/time
                                }
                            } catch (e: any) {
                                if (signal.aborted) throw e; // Re-throw if it was an abort
                                if (!toolExecuted) s.stop(`Error executing ${tName}`);
                                else {
                                    if (qaSpinner) qaSpinner.stop('Verification Error');
                                    log.error(`Error during verification: ${e.message}`);
                                }

                                ctx.history.push({ role: 'user', content: `Error executing ${tName}: ${e.message}` });
                                input = 'Fix the error.';
                                allExecuted = false;
                                break;
                            }
                        }
                    }

                    if (signal.aborted) {
                        input = undefined;
                        continue;
                    }

                    if (allExecuted) {
                         input = 'The tool executions were verified. Proceed.';
                    }
                    continue;
                }

                // --- Lazy Agent Detection ---
                const rawText = (message || response.raw || '').toLowerCase();
                const isRefusal = /(cannot|can't|unable to|no access|don't have access) (to )?(create|write|modify|delete|save|edit)/.test(rawText) || /(did not|didn't) (create|write|modify|delete|save|edit).*?file/.test(rawText);
                const isHallucination = /(i|i've|i have) (created|updated|modified|deleted|saved|written) (the file|a file)/.test(rawText);
                const isLazyInstruction = /(please|you need to|you should|run this) (create|save|write|copy)/.test(rawText) && /(file|code)/.test(rawText);

                if (isRefusal || isHallucination || isLazyInstruction) {
                     log.warn('Lazy/Hallucinating Agent detected. Forcing retry...');
                     if (message) log.info(pc.dim(`Agent: ${message}`));

                     ctx.history.push({ role: 'assistant', content: message || response.raw });

                     input = "System Correction: You MUST use the 'write_files' tool to create or modify files. Do not describe the action or ask the user to do it. Use the tool now.";
                     continue;
                }
                // ----------------------------

                if (message || response.raw) {
                    console.log();
                    console.log(pc.blue('Agent:'));
                    console.log(message || response.raw);
                    console.log();
                }
                ctx.history.push({ role: 'assistant', content: message || response.raw });
                input = undefined;

            } catch (e: any) {
                if (aborted || signal.aborted || e.name === 'AbortError') {
                    // Already logged interruption or will just loop back
                    input = undefined;
                    continue;
                }
                // Log actual errors
                log.error(`Error: ${e.message}`);
                // Break or continue? Probably continue to prompt
                input = undefined;
            } finally {
                if (process.stdin.isTTY) {
                    process.stdin.removeListener('keypress', onKeypress);
                    process.stdin.setRawMode(false);
                }
            }
        }
    }
}
