import { text, confirm as clackConfirm, isCancel, select } from '@clack/prompts';
import pc from 'picocolors';
import { ContextManager } from '../context.js';
import { Executor, ExecutorOptions } from './types.js';
import { type Provider } from '../providers/index.js';
import { type Tier } from '../router.js';
import { routeTask } from '../router.js';
import { executeCommand } from '../commands.js';
import { listSkills, setActiveSkill, getActiveSkill } from '../skills.js';
import { existsSync, appendFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { runDeterministicOrganizer } from '../tools/organizer.js';
import { jsonrepair } from 'jsonrepair';
import type { AnyLLMResponse } from '../lib/anyllm.js';
import fs from 'fs';
import { executeTool } from './utils.js';

export interface SimpleExecutorFlags {
  moe: boolean;
  claw: boolean;
  ghost: boolean;
  yolo: boolean;
  debug: boolean;
  nonInteractive: boolean;
  clawIntent: string | null;
}

export class SimpleCoreExecutor implements Executor {
  name = 'simple-core';
  description = 'The classic Simple CLI executor';

  // Loop detection state
  private lastTool: { name: string; args: string } | null = null;
  private repetitionCount: number = 0;

  constructor(
    private singleProvider: Provider | null,
    private multiProvider: any | null,
    private tierConfigs: any | null,
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

    if (this.flags.moe && this.multiProvider && this.tierConfigs) {
      const routing = await routeTask(input, async (prompt) => {
        const res = await this.multiProvider.generateWithTier(1, prompt, [{ role: 'user', content: input }]);
        return res.raw || JSON.stringify(res);
      });
      if (this.flags.debug) console.log(pc.dim(`[Routing] Tier: ${routing.tier}`));
      return this.multiProvider.generateWithTier(routing.tier as Tier, fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
    }

    return this.singleProvider!.generateResponse(fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
  }

  async execute(options: ExecutorOptions): Promise<void> {
    const { ctx, targetDir, initialPrompt } = options;
    let isFirstPrompt = true;
    const isAutonomousMode = this.flags.claw && this.flags.clawIntent;
    let autonomousNudges = 0;

    // args from CLI are not directly available here, so we rely on initialPrompt
    // initialPrompt corresponds to `args.join(' ')` in CLI.

    const { clawIntent } = this.flags;

    while (true) {
      const skill = getActiveSkill();
      let input: string | symbol;

      if (isFirstPrompt && (initialPrompt || clawIntent)) {
        input = initialPrompt || clawIntent || '';
        if (input) console.log(`\n${pc.magenta('➤')} ${pc.bold(input as string)}`);
      } else {
        if (this.flags.nonInteractive) {
          input = '';
        } else {
          input = await text({
            message: pc.dim(`[@${skill.name}]`) + ' Chat with Simple-CLI',
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
          let selected: string | undefined;
          if (this.flags.nonInteractive) {
            selected = skills.length > 0 ? skills[0].name : undefined;
          } else {
            const sel = await select({
              message: 'Select a skill',
              options: skills.map(s => ({ label: `@${s.name} - ${s.description}`, value: s.name }))
            });
            if (!isCancel(sel)) selected = sel as string;
          }
          if (selected) {
            const newSkill = setActiveSkill(selected as string);
            if (newSkill) ctx.setSkill(newSkill);
          }
        } else {
          const newSkill = setActiveSkill(skillName);
          if (newSkill) {
            ctx.setSkill(newSkill);
            console.log(`\n${pc.cyan('★')} Switched to @${newSkill.name}`);
          } else {
            console.log(`\n${pc.red('✖')} Skill @${skillName} not found.`);
          }
        }
        continue;
      }

      ctx.addMessage('user', trimmedInput);

      let currentInput = trimmedInput;
      if (this.flags.claw || this.flags.ghost) {
        currentInput = `MISSION START: ${trimmedInput}. Consult your persona in AGENT.md and perform the mission tasks immediately. Use list_dir to see what you are working with.`;
      }

      let steps = 0;
      let ghostLogFile: string | null = null;
      if (this.flags.ghost) {
        const logDir = join(targetDir, '.simple/workdir/memory/logs');
        if (!existsSync(logDir)) await mkdir(logDir, { recursive: true });
        ghostLogFile = join(logDir, `ghost-${Date.now()}.log`);
        await writeFile(ghostLogFile, `[GHOST START] Intent: ${trimmedInput}\n`);
      }

      while (steps < 15) {
        const response = await this.generate(currentInput, ctx);
        const { thought, tool, args, message } = response;
        const action = { tool: tool || 'none', args: args || {}, message: message || '' };

        const logMsg = (msg: string) => {
          if (this.flags.ghost && ghostLogFile) {
            fs.appendFileSync(ghostLogFile, msg + '\n');
          } else {
            console.log(msg);
          }
        };

        if (thought) logMsg(`\n${pc.dim('💭')} ${pc.cyan(thought)}`);

        if (action.tool !== 'none') {
            // Loop detection
            const currentArgsStr = JSON.stringify(action.args);
            if (this.lastTool && this.lastTool.name === action.tool && this.lastTool.args === currentArgsStr) {
                this.repetitionCount++;
            } else {
                this.lastTool = { name: action.tool, args: currentArgsStr };
                this.repetitionCount = 0;
            }

            if (this.repetitionCount >= 3) {
                const warning = `Warning: You are repeating the same tool call (${action.tool}) with identical arguments. This loop has been detected and interrupted. Please reflect on why this is happening and change your approach.`;
                logMsg(`\n${pc.yellow('⚠')} ${warning}`);
                ctx.addMessage('user', warning);
                // Skip execution, feed back warning
                const assistantMsg = response.raw || JSON.stringify(response);
                ctx.addMessage('assistant', assistantMsg);
                continue;
            }

          if (await this.confirm(action.tool, action.args || {}, ctx)) {
            logMsg(`${pc.yellow('⚙')} ${pc.dim(`Executing ${action.tool}...`)}`);
            const result = await executeTool(action.tool, action.args || {}, ctx);
            const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
            logMsg(`${pc.green('✔')} ${pc.dim(resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr)}`);

            const assistantMsg = response.raw || JSON.stringify(response);
            ctx.addMessage('assistant', assistantMsg);
            ctx.addMessage('user', `Tool result: ${resultStr}. Continue the mission.`);
            currentInput = 'Continue the mission.';
            steps++;

            if (this.flags.claw || this.flags.ghost) {
              const brain = ctx.getTools().get('claw_brain');
              if (brain) {
                await brain.execute({
                  action: 'log_reflection',
                  content: `Executed ${action.tool}. Result: ${resultStr.slice(0, 150)}...`
                });

                const summary = (await brain.execute({ action: 'get_summary' })) as any;
                if (summary.status === 'completed') {
                  logMsg(`\n${pc.green('📌')} Mission status: completed. Ending loop.`);
                  break;
                }
              }
            }
            continue;
          } else {
            logMsg(`${pc.yellow('⚠')} Skipped.`);
            const assistantMsg = response.raw || JSON.stringify(response);
            ctx.addMessage('assistant', assistantMsg);
            continue;
          }
        } else {
          const assistantMessage = action.message || response.raw || '';
          if (assistantMessage) {
            logMsg(`\n${pc.green('🤖')} ${assistantMessage}`);
            ctx.addMessage('assistant', response.raw || assistantMessage);
          } else {
            logMsg(`\n${pc.red('✖')} Agent returned an empty response.`);
          }
          break;
        }
        break;
      }

      if (isAutonomousMode && steps === 0) {
        autonomousNudges++;
        console.log(pc.yellow(`⚡ Agent replied with text only. Forcing tool usage (nudge ${autonomousNudges}/2)...`));
        if (autonomousNudges > 2) {
          console.log(pc.yellow('⚠️ Agent did not act after several nudges — running deterministic fallback organizer...'));
          try {
            runDeterministicOrganizer(targetDir);
          } catch (err) {
            console.error('Fallback organizer failed:', err);
          }
          console.log(pc.green('✅'));
          this.mcpManager.disconnectAll();
          process.exit(0);
        }
        ctx.addMessage('user', 'Do not just explain. Use the tools (e.g., list_dir) to execute the plan immediately.');
        continue;
      }

      if (isAutonomousMode) {
        console.log(`\n${pc.dim('─'.repeat(60))}`);
        console.log(`${pc.cyan('📊 Execution Summary:')}`);
        console.log(`${pc.dim('  Steps taken:')} ${steps}`);
        console.log(`${pc.dim('  Final status:')} Task completed`);

        const brain = ctx.getTools().get('claw_brain');
        if (brain) {
          console.log(pc.dim('🧠 Organizing memory...'));
          await brain.execute({ action: 'prune' });
        }

        console.log(`\n${pc.green('✅')} Autonomous task completed.`);
        console.log(`${pc.dim('Exiting autonomous mode...')}`);
        this.mcpManager.disconnectAll();
        process.exit(0);
      }
    }
  }
}
