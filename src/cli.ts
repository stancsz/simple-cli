#!/usr/bin/env node
/**
 * Simple-CLI - Premium TUI agentic coding assistant
 * Powered by @clack/prompts.
 */
import 'dotenv/config';
import { intro, outro, text, spinner as clackSpinner, note, confirm as clackConfirm, isCancel, select } from '@clack/prompts';
import pc from 'picocolors';
import { ContextManager, getContextManager } from './context.js';
import { createProvider } from './providers/index.js';
import { createMultiProvider } from './providers/multi.js';
import { routeTask, loadTierConfig, formatRoutingDecision, type Tier } from './router.js';
import { executeCommand } from './commands.js';
import { getMCPManager } from './mcp/manager.js';
import { listSkills, setActiveSkill, getActiveSkill } from './skills.js';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runSwarm, parseSwarmArgs, printSwarmHelp } from './commands/swarm.js';
import { jsonrepair } from 'jsonrepair';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI flags
const MOE_MODE = process.argv.includes('--moe');
const SWARM_MODE = process.argv.includes('--swarm');
const CLAW_MODE = process.argv.includes('--claw') || process.argv.includes('-claw');
const YOLO_MODE = process.argv.includes('--yolo') || CLAW_MODE;
const DEBUG = process.argv.includes('--debug') || process.env.DEBUG === 'true';
const VERSION = '0.2.2';

// Handle --version and --help immediately
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`Simple-CLI v${VERSION}`);
  process.exit(0);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
  ${pc.bgCyan(pc.black(' SIMPLE-CLI '))} ${pc.dim(`v${VERSION}`)}

  ${pc.bold('Usage:')}
    simple [target_dir] [prompt] [options]

  ${pc.bold('Options:')}
    --version, -v      Show version
    --help, -h         Show help
    --yolo             Skip all confirmation prompts
    --moe              Enable Mixture of Experts (multi-model)
    --swarm            Enable Swarm orchestration mode
    --claw "intent"    Enable OpenClaw JIT agent generation
    --debug            Enable debug logging

  ${pc.bold('Examples:')}
    simple . "Build a login page"
    simple --claw "Security audit this project"
    simple --moe "Refactor this entire folder"
  `);
  process.exit(0);
}

// Claw mode will be handled after directory change in main()
let clawIntent: string | null = null;

// Handle --swarm mode
if (SWARM_MODE) {
  if (process.argv.includes('--help')) {
    printSwarmHelp();
    process.exit(0);
  }
  const swarmOptions = parseSwarmArgs(process.argv.slice(2));
  swarmOptions.yolo = swarmOptions.yolo || YOLO_MODE;
  runSwarm(swarmOptions).catch(err => {
    console.error('Swarm error:', err);
    process.exit(1);
  });
} else {
  main().catch(console.error);
}

function parseResponse(response: string) {
  // Try parsing as pure JSON first (for JSON mode)
  try {
    const parsed = JSON.parse(jsonrepair(response.trim()));
    const tool = parsed.tool;
    if (tool) {
      return {
        thought: parsed.thought || '',
        action: {
          tool: tool,
          message: parsed.message || '',
          args: parsed.args || parsed.parameters || parsed.input || parsed
        }
      };
    }
  } catch { /* Fall through to legacy format */ }

  // Legacy format with <thought> tags
  const thought = response.match(/<thought>([\s\S]*?)<\/thought>/)?.[1]?.trim() || '';
  const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  let action = { tool: 'none', message: '', args: {} as Record<string, unknown> };
  if (jsonMatch) {
    try {
      action = JSON.parse(jsonrepair(jsonMatch[0]));
    } catch { /* skip */ }
  }
  return { thought, action };
}

async function confirm(tool: string, args: Record<string, unknown>, ctx: ContextManager): Promise<boolean> {
  if (YOLO_MODE) return true;
  const t = ctx.getTools().get(tool);
  if (!t || t.permission === 'read') return true;

  const confirmed = await clackConfirm({
    message: `Allow ${pc.cyan(tool)} with args ${pc.dim(JSON.stringify(args))}?`,
    initialValue: true,
  });
  return !isCancel(confirmed) && confirmed;
}

async function executeTool(name: string, args: Record<string, unknown>, ctx: ContextManager): Promise<string> {
  const tool = ctx.getTools().get(name);
  if (!tool) return `Error: Tool "${name}" not found`;
  try {
    const result = await tool.execute(args);
    return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : error}`;
  }
}



async function main(): Promise<void> {
  // console.clear();

  const originalCwd = process.cwd(); // Save original cwd before any directory changes
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
  let targetDir = originalCwd;

  if (args.length > 0) {
    try {
      if (statSync(args[0]).isDirectory()) {
        targetDir = resolve(args[0]);
        process.chdir(targetDir);
        // Reload .env from the new directory
        const { config } = await import('dotenv');
        config();
        args.shift();
      }
    } catch { /* ignored */ }
  }

  // Handle --claw mode AFTER directory change
  if (CLAW_MODE) {
    const { execSync } = await import('child_process');
    // args now has directory removed, so join the rest as intent
    clawIntent = args.join(' ') || 'unspecified task';

    console.log(pc.cyan('🧬 Initiating JIT Agent Generation...'));
    console.log(pc.dim(`Intent: "${clawIntent}"`));
    console.log(pc.dim(`Working Directory: ${targetDir}`));

    try {
      const { generateJitAgent } = await import('./claw/jit.js');
      await generateJitAgent(clawIntent, targetDir);

      console.log(pc.green('\n✅ JIT Agent soul ready. Starting autopilot loop...\n'));
    } catch (error) {
      console.error(pc.red('❌ Failed to initialize Claw mode:'), error);
      process.exit(1);
    }
  }

  console.log(`\n ${pc.bgCyan(pc.black(' SIMPLE-CLI '))} ${pc.dim(`v${VERSION}`)} ${pc.green('●')} ${pc.cyan(targetDir)}\n`);

  console.log(`${pc.dim('○')} Initializing...`);
  const ctx = getContextManager(targetDir);
  await ctx.initialize();
  console.log(`${pc.green('●')} Ready.`);

  const mcpManager = getMCPManager();
  try {
    const configs = await mcpManager.loadConfig();
    if (configs.length > 0) await mcpManager.connectAll(configs);
  } catch (error) {
    if (DEBUG) console.error('MCP init error:', error);
  }

  const tierConfigs = MOE_MODE ? loadTierConfig() : null;
  const multiProvider = tierConfigs ? createMultiProvider(tierConfigs) : null;
  const singleProvider = !MOE_MODE ? createProvider() : null;


  const generate = async (input: string): Promise<string> => {
    const history = ctx.getHistory();
    const fullPrompt = await ctx.buildSystemPrompt();


    if (MOE_MODE && multiProvider && tierConfigs) {
      const routing = await routeTask(input, async (prompt) => {
        return multiProvider.generateWithTier(1, prompt, [{ role: 'user', content: input }]);
      });
      if (DEBUG) console.log(pc.dim(`[Routing] Tier: ${routing.tier}`));
      return multiProvider.generateWithTier(routing.tier as Tier, fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
    }

    return singleProvider!.generateResponse(fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
  };

  let isFirstPrompt = true;
  const isAutonomousMode = CLAW_MODE && clawIntent;

  while (true) {
    const skill = getActiveSkill();
    let input: string | symbol;

    // Support initial prompt from command line or claw intent
    if (isFirstPrompt && (clawIntent || args.length > 0)) {
      input = clawIntent || args.join(' ');
      console.log(`\n${pc.magenta('➤')} ${pc.bold(input)}`);
    } else {
      input = await text({
        message: pc.dim(`[@${skill.name}]`) + ' Chat with Simple-CLI',
        placeholder: 'Ask anything or use /help',
        validate(value) {
          if (value.trim().length === 0) return 'Input required';
        }
      });
    }

    isFirstPrompt = false;

    if (isCancel(input)) {
      console.log(`\n${pc.dim('—')} Goodbye!`);
      mcpManager.disconnectAll();
      process.exit(0);
    }

    const trimmedInput = (input as string).trim();

    // Slash command
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

    // Skill switching
    if (trimmedInput.startsWith('@')) {
      const skillName = trimmedInput.slice(1).trim();
      if (skillName === 'list') {
        const skills = listSkills();
        const selected = await select({
          message: 'Select a skill',
          options: skills.map(s => ({ label: `@${s.name} - ${s.description}`, value: s.name }))
        });
        if (!isCancel(selected)) {
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

    let steps = 0;
    while (steps < 15) {
      const response = await generate(trimmedInput);
      const { thought, action } = parseResponse(response);

      if (thought) console.log(`\n${pc.dim('💭')} ${pc.cyan(thought)}`);

      if (action.tool !== 'none') {
        if (await confirm(action.tool, action.args || {}, ctx)) {
          console.log(`${pc.yellow('⚙')} ${pc.dim(`Executing ${action.tool}...`)}`);
          const result = await executeTool(action.tool, action.args || {}, ctx);
          console.log(`${pc.green('✔')} ${pc.dim(result.length > 500 ? result.slice(0, 500) + '...' : result)}`);

          ctx.addMessage('assistant', response);
          ctx.addMessage('user', `Tool result: ${result}`);

          // Autonomous Reflection
          if (CLAW_MODE) {
            const brain = ctx.getTools().get('clawBrain');
            if (brain) {
              await brain.execute({
                action: 'reflect',
                content: `Executed ${action.tool} with args ${JSON.stringify(action.args)}. Result: ${result.slice(0, 200)}...`
              });
            }
          }

          steps++;
        } else {
          console.log(`${pc.yellow('⚠')} Skipped.`);
          ctx.addMessage('assistant', response);
          break;
        }
      } else {
        const msg = action.message || response.replace(/<thought>[\s\S]*?<\/thought>/, '').trim();
        if (msg) console.log(`\n${pc.magenta('✦')} ${msg}`);
        ctx.addMessage('assistant', response);

        // In autonomous mode, if we haven't done any steps yet, nudge the agent
        if (isAutonomousMode && steps === 0) {
          console.log(pc.yellow('⚡ Agent replied with text only. Forcing tool usage...'));
          ctx.addMessage('user', 'Do not just explain. Use the tools (e.g., list_dir) to execute the plan immediately.');
          continue;
        }

        // In autonomous mode, show summary and exit
        if (isAutonomousMode) {
          console.log(`\n${pc.dim('─'.repeat(60))}`);
          console.log(`${pc.cyan('📊 Execution Summary:')}`);
          console.log(`${pc.dim('  Steps taken:')} ${steps}`);
          console.log(`${pc.dim('  Final status:')} Task completed`);

          // Autonomous Pruning on Exit
          const brain = ctx.getTools().get('clawBrain');
          if (brain) {
            console.log(pc.dim('🧠 Organizing memory...'));
            await brain.execute({ action: 'prune' });
          }

          console.log(`\n${pc.green('✅')} Autonomous task completed.`);
          console.log(`${pc.dim('Exiting autonomous mode...')}`);
          mcpManager.disconnectAll();
          process.exit(0);
        }
        break;
      }
    }
  }
}
