import { text, confirm as clackConfirm, isCancel, select } from '@clack/prompts';
import pc from 'picocolors';
import { ContextManager } from '../context.js';
import { Executor, ExecutorOptions } from './types.js';
import { type Provider, createProviderForModel } from '../providers/index.js';
import { routeTaskStrategy } from '../router.js';
import { executeCommand } from '../commands.js';
import { listSkills, setActiveSkill, getActiveSkill } from '../skills.js';
import type { AnyLLMResponse } from '../lib/anyllm.js';
import { executeTool } from './utils.js';

export interface SimpleExecutorFlags {
  ghost: boolean;
  yolo: boolean;
  debug: boolean;
  nonInteractive: boolean;
}

export class SimpleCoreExecutor implements Executor {
  name = 'simple-core';
  description = 'The classic Simple CLI executor';

  // Loop detection state
  private lastTool: { name: string; args: string } | null = null;
  private repetitionCount: number = 0;

  constructor(
    private singleProvider: Provider | null,
    private mcpManager: any,
    private flags: SimpleExecutorFlags
  ) {}

  private async confirm(tool: string, args: Record<string, unknown>, ctx: ContextManager): Promise<boolean> {
    if (this.flags.yolo) return true;
    const t = ctx.getTools().get(tool);
    if (!t || t.permission === 'read') return true;
    if (this.flags.nonInteractive) return true;

    const confirmed = await clackConfirm({
      message: `Allow ${pc.cyan(tool)} with args ${pc.dim(JSON.stringify(args))}?`,
      initialValue: true,
    });
    return !isCancel(confirmed) && confirmed;
  }

  private async generate(input: string, ctx: ContextManager): Promise<AnyLLMResponse> {
    const history = ctx.getHistory();
    const fullPrompt = await ctx.buildSystemPrompt();
    return this.singleProvider!.generateResponse(fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
  }

  async execute(options: ExecutorOptions): Promise<void> {
    const { ctx, targetDir, initialPrompt } = options;
    let isFirstPrompt = true;

    // --- Dynamic Routing Logic ---
    if (initialPrompt) {
        // Use existing provider to make the routing call, or default
        const orchestrator = async (p: string) => {
            if (this.singleProvider) {
                 const res = await this.singleProvider.generateResponse(p, []);
                 return res.thought || res.message || res.raw;
            }
            return '';
        };

        console.log(pc.dim('🔄 Analyzing task complexity...'));
        const strategy = await routeTaskStrategy(initialPrompt, orchestrator);
        console.log(pc.cyan(`⚡ Selected Model: ${pc.bold(strategy.model)}`));
        console.log(pc.dim(`   Reasoning: ${strategy.reasoning}`));

        // Apply the new provider
        this.singleProvider = createProviderForModel(strategy.model);
    }
    // -----------------------------

    while (true) {
      const skill = getActiveSkill();
      let input: string | symbol;

      if (isFirstPrompt && initialPrompt) {
        input = initialPrompt;
        console.log(`\n${pc.magenta('➤')} ${pc.bold(input as string)}`);
      } else {
        if (this.flags.nonInteractive) {
          input = '';
        } else {
          input = await text({
            message: pc.dim(`[@${skill.name}]`) + ' Chat',
            placeholder: 'Ask anything or use /help',
            validate(value) {
              if (value.trim().length === 0) return 'Input required';
            }
          });
        }
      }

      isFirstPrompt = false;

      if (isCancel(input)) {
        console.log(`\n${pc.dim('—')} Goodbye!`);
        this.mcpManager.disconnectAll();
        process.exit(0);
      }

      const trimmedInput = (input as string).trim();

      if (trimmedInput.startsWith('/')) {
        try {
          await executeCommand(trimmedInput, {
            cwd: ctx.getCwd(),
            activeFiles: ctx.getState().activeFiles,
            readOnlyFiles: ctx.getState().readOnlyFiles,
            history: ctx.getHistory(),
            io: {
              output: (m) => console.log(`\n${pc.dim('○')} ${m}`),
              error: (m) => console.log(`\n${pc.red('✖')} ${m}`),
              confirm: async (m) => {
                const c = await clackConfirm({ message: m });
                return !isCancel(c) && c;
              },
              prompt: async (m) => {
                const p = await text({ message: m });
                return isCancel(p) ? '' : p as string;
              }
            }
          });
        } catch (err) {
          console.log(`\n${pc.red('✖')} ${pc.red(String(err))}`);
        }
        continue;
      }

      if (trimmedInput.startsWith('@')) {
        const skillName = trimmedInput.slice(1).trim();
        if (skillName === 'list') {
             const skills = listSkills();
             const selected = skills.length > 0 ? skills[0].name : undefined;
             if (selected) {
                 const newSkill = setActiveSkill(selected);
                 if (newSkill) ctx.setSkill(newSkill);
             }
        } else {
          const newSkill = setActiveSkill(skillName);
          if (newSkill) {
            ctx.setSkill(newSkill);
            console.log(`\n${pc.cyan('★')} Switched to @${newSkill.name}`);
          }
        }
        continue;
      }

      ctx.addMessage('user', trimmedInput);

      let currentInput = trimmedInput;
      if (this.flags.ghost) {
        currentInput = `MISSION START: ${trimmedInput}. Consult your persona in AGENT.md. Use list_dir to see what you are working with.`;
      }

      // Steps loop
      let steps = 0;
      while (steps < 15) {
        const response = await this.generate(currentInput, ctx);
        const { thought, tool, args, message } = response;

        if (thought) console.log(`\n${pc.dim('💭')} ${pc.cyan(thought)}`);

        if (tool !== 'none') {
             // Loop detection
             const currentArgsStr = JSON.stringify(args);
             if (this.lastTool && this.lastTool.name === tool && this.lastTool.args === currentArgsStr) {
                this.repetitionCount++;
             } else {
                this.lastTool = { name: tool, args: currentArgsStr };
                this.repetitionCount = 0;
             }
             if (this.repetitionCount >= 3) {
                 console.log(pc.yellow('⚠ Loop detected. Stopping.'));
                 break;
             }

             if (await this.confirm(tool, args || {}, ctx)) {
                console.log(`${pc.yellow('⚙')} Executing ${tool}...`);
                const result = await executeTool(tool, args || {}, ctx);
                const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
                console.log(`${pc.green('✔')} Result: ${resultStr.slice(0, 200)}...`);

                // Feedback to agent
                ctx.addMessage('assistant', response.raw || JSON.stringify(response));
                ctx.addMessage('user', `Tool result: ${resultStr}. Continue.`);
                currentInput = 'Continue.';
                steps++;
             } else {
                console.log('Skipped.');
                ctx.addMessage('assistant', response.raw || JSON.stringify(response));
             }
        } else {
            console.log(`\n${pc.green('🤖')} ${message || response.raw}`);
            ctx.addMessage('assistant', response.raw || message || '');
            break;
        }
      }
    }
  }
}
