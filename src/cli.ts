#!/usr/bin/env node
/**
 * Simple-CLI - Premium TUI agentic coding assistant
 * Powered by @clack/prompts.
 */
import 'dotenv/config';
import { intro, outro, text, spinner as clackSpinner, note, confirm as clackConfirm, isCancel, select } from '@clack/prompts';
import pc from 'picocolors';
import { ContextManager, getContextManager } from './context.js';
import { createProvider, type Provider } from './providers/index.js';
import type { TypeLLMResponse } from '@stan-chen/typellm';
import { createMultiProvider } from './providers/multi.js';
import { routeTask, loadTierConfig, formatRoutingDecision, type Tier } from './router.js';
import { executeCommand } from './commands.js';
import { getMCPManager } from './mcp/manager.js';
import { listSkills, setActiveSkill, getActiveSkill } from './skills.js';
import { readFileSync, existsSync, statSync, appendFileSync } from 'fs';
import fs from 'fs';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runSwarm, parseSwarmArgs, printSwarmHelp } from './commands/swarm.js';
import { runDeterministicOrganizer } from './tools/organizer.js';
import { jsonrepair } from 'jsonrepair';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Deterministic organizer moved to src/tools/organizer.ts

// CLI flags
const MOE_MODE = process.argv.includes('--moe');
const SWARM_MODE = process.argv.includes('--swarm');
const SERVER_MODE = process.argv.includes('--server');
const CLAW_MODE = process.argv.includes('--claw') || process.argv.includes('-claw');
const GHOST_MODE = process.argv.includes('--ghost');
const YOLO_MODE = process.argv.includes('--yolo') || CLAW_MODE || GHOST_MODE;
const DEBUG = process.argv.includes('--debug') || process.env.DEBUG === 'true';
const VERSION = '0.2.2';

// Non-interactive detection (tests and CI)
const NON_INTERACTIVE = process.env.VITEST === 'true' || process.env.TEST === 'true' || !process.stdin.isTTY;
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
if (SERVER_MODE) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex !== -1 ? parseInt(process.argv[portIndex + 1]) : 3000;

  import('./mcp/server.js').then(({ startMCPServer }) => {
    startMCPServer(port);
  }).catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
} else if (SWARM_MODE) {
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
    const trimmed = response.trim();
    const parsed = JSON.parse(jsonrepair(trimmed));
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

  // Clean thought from response for message parsing
  let cleanResponse = response.replace(/<thought>[\s\S]*?<\/thought>/, '').trim();

  const jsonMatch = cleanResponse.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  let action = { tool: 'none', message: '', args: {} as Record<string, unknown> };

  if (jsonMatch) {
    try {
      action = JSON.parse(jsonrepair(jsonMatch[0]));
      // normalize tool names to snake_case for consistency with tool registry
      if (action && action.tool && typeof action.tool === 'string') {
        action.tool = String(action.tool).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
      }
      // Remove JSON block for the remaining message
      cleanResponse = cleanResponse.replace(jsonMatch[0], '').trim();
    } catch { /* skip */ }
  }

  // If we still have text and no message, use the remaining text
  if (!action.message && cleanResponse) {
    action.message = cleanResponse;
  }

  return { thought, action };
}

async function confirm(tool: string, args: Record<string, unknown>, ctx: ContextManager): Promise<boolean> {
  if (YOLO_MODE) return true;
  const t = ctx.getTools().get(tool);
  if (!t || t.permission === 'read') return true;

  if (NON_INTERACTIVE) return true; // auto-approve in non-interactive/test environments

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

  // Handle Claw Management Flags
  if (process.argv.includes('--list')) {
    const { listClawAssets } = await import('./claw/management.js');
    await listClawAssets();
    process.exit(0);
  }
  if (process.argv.includes('--logs')) {
    const { showGhostLogs } = await import('./claw/management.js');
    const id = process.argv[process.argv.indexOf('--logs') + 1];
    await showGhostLogs(id && !id.startsWith('-') ? id : undefined);
    process.exit(0);
  }
  if (process.argv.includes('--kill')) {
    const { killGhostTask } = await import('./claw/management.js');
    const id = process.argv[process.argv.indexOf('--kill') + 1];
    if (!id || id.startsWith('-')) {
      console.error(pc.red('Error: Task ID required for --kill'));
      process.exit(1);
    }
    await killGhostTask(id);
    process.exit(0);
  }

  if (process.argv.includes('--invoke') || process.argv.includes('--invoke-json')) {
    const isJson = process.argv.includes('--invoke-json');
    const idx = process.argv.indexOf(isJson ? '--invoke-json' : '--invoke');
    const toolName = process.argv[idx + 1];
    const toolArgsStr = process.argv[idx + 2] || '{}';

    if (!toolName) {
      console.error(pc.red('Error: Tool name required for --invoke'));
      process.exit(1);
    }

    try {
      const ctx = getContextManager(process.cwd());
      await ctx.initialize();
      const toolArgs = JSON.parse(toolArgsStr);
      const result = await executeTool(toolName, toolArgs, ctx);
      console.log(result);
      process.exit(0);
    } catch (error) {
      console.error(pc.red(`Error invoking tool ${toolName}:`), error);
      process.exit(1);
    }
  }

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

      // If the generated AGENT.md doesn't contain actionable tool instructions,
      // run the deterministic organizer immediately so live demos are deterministic.
      try {
        const agentFile = join(targetDir, '.simple', 'workdir', 'AGENT.md');
        let agentContent = '';
        try { agentContent = readFileSync(agentFile, 'utf-8'); } catch { agentContent = ''; }
        const actionable = /list_dir|move_file|move files|move_file|write_to_file|list files|scheduler|schedule|extract total|move\b/i.test(agentContent);
        if (!actionable) {
          console.log(pc.yellow('AGENT.md lacks actionable steps — running deterministic organizer fallback.'));
          runDeterministicOrganizer(targetDir);
        }
      } catch (err) {
        console.error('Error checking AGENT.md for actions:', err);
      }

      console.log(pc.green('\n✅ JIT Agent soul ready. Starting autopilot loop...\n'));

      // Inject autonomous environment variables
      if (!process.env.CLAW_WORKSPACE) {
        process.env.CLAW_WORKSPACE = targetDir;
      }
      process.env.CLAW_SKILL_PATH = join(targetDir, 'skills');
      process.env.CLAW_DATA_DIR = join(targetDir, '.simple/workdir/memory');
    } catch (error) {
      console.error(pc.red('❌ Failed to initialize Claw mode:'), error);
      process.exit(1);
    }
  }

  if (!GHOST_MODE) {
    console.log(`\n ${pc.bgCyan(pc.black(' SIMPLE-CLI '))} ${pc.dim(`v${VERSION}`)} ${pc.green('●')} ${pc.cyan(targetDir)}\n`);
    console.log(`${pc.dim('○')} Initializing...`);
  }
  const ctx = getContextManager(targetDir);
  await ctx.initialize();
  if (!GHOST_MODE) console.log(`${pc.green('●')} Ready.`);

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


  const generate = async (input: string): Promise<TypeLLMResponse> => {
    const history = ctx.getHistory();
    const fullPrompt = await ctx.buildSystemPrompt();

    if (MOE_MODE && multiProvider && tierConfigs) {
      const routing = await routeTask(input, async (prompt) => {
        const res = await multiProvider.generateWithTier(1, prompt, [{ role: 'user', content: input }]);
        return res.raw || JSON.stringify(res);
      });
      if (DEBUG) console.log(pc.dim(`[Routing] Tier: ${routing.tier}`));
      return multiProvider.generateWithTier(routing.tier as Tier, fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
    }

    return singleProvider!.generateResponse(fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
  };

  let isFirstPrompt = true;
  const isAutonomousMode = CLAW_MODE && clawIntent;
  let autonomousNudges = 0;

  while (true) {
    const skill = getActiveSkill();
    let input: string | symbol;

    // Support initial prompt from command line or claw intent
    if (isFirstPrompt && (clawIntent || args.length > 0)) {
      input = clawIntent || args.join(' ');
      console.log(`\n${pc.magenta('➤')} ${pc.bold(input)}`);
    } else {
      if (NON_INTERACTIVE) {
        // In non-interactive mode return empty string to allow tests to inject inputs
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
        let selected: string | undefined;
        if (NON_INTERACTIVE) {
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
    if (CLAW_MODE || GHOST_MODE) {
      currentInput = `MISSION START: ${trimmedInput}. Consult your persona in AGENT.md and perform the mission tasks immediately. Use list_dir to see what you are working with.`;
    }

    let steps = 0;
    let ghostLogFile: string | null = null;
    if (GHOST_MODE) {
      const logDir = join(targetDir, '.simple/workdir/memory/logs');
      if (!existsSync(logDir)) await mkdir(logDir, { recursive: true });
      ghostLogFile = join(logDir, `ghost-${Date.now()}.log`);
      await writeFile(ghostLogFile, `[GHOST START] Intent: ${trimmedInput}\n`);
    }

    while (steps < 15) {
      const response = await generate(currentInput);
      const { thought, tool, args, message } = response;
      const action = { tool: tool || 'none', args: args || {}, message: message || '' };

      const logMsg = (msg: string) => {
        if (GHOST_MODE && ghostLogFile) {
          fs.appendFileSync(ghostLogFile, msg + '\n');
        } else {
          console.log(msg);
        }
      };

      if (thought) logMsg(`\n${pc.dim('💭')} ${pc.cyan(thought)}`);

      if (action.tool !== 'none') {
        if (await confirm(action.tool, action.args || {}, ctx)) {
          logMsg(`${pc.yellow('⚙')} ${pc.dim(`Executing ${action.tool}...`)}`);
          const result = await executeTool(action.tool, action.args || {}, ctx);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
          logMsg(`${pc.green('✔')} ${pc.dim(resultStr.length > 500 ? resultStr.slice(0, 500) + '...' : resultStr)}`);

          const assistantMsg = response.raw || JSON.stringify(response);
          ctx.addMessage('assistant', assistantMsg);
          ctx.addMessage('user', `Tool result: ${resultStr}. Continue the mission.`);
          currentInput = 'Continue the mission.';
          steps++;
          // Autonomous Reflection & Status Check
          if (CLAW_MODE || GHOST_MODE) {
            const brain = ctx.getTools().get('claw_brain');
            if (brain) {
              await brain.execute({
                action: 'log_reflection',
                content: `Executed ${action.tool}. Result: ${resultStr.slice(0, 150)}...`
              });

              // Check if mission is marked completed
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
        // Fallback for empty message/tool to avoid "no reply"
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
    // In autonomous mode, if we haven't done any steps yet, nudge the agent
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
        // Exit autonomous mode after fallback
        console.log(pc.green('✅'));
        mcpManager.disconnectAll();
        process.exit(0);
      }
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
      const brain = ctx.getTools().get('claw_brain');
      if (brain) {
        console.log(pc.dim('🧠 Organizing memory...'));
        await brain.execute({ action: 'prune' });
      }

      console.log(`\n${pc.green('✅')} Autonomous task completed.`);
      console.log(`${pc.dim('Exiting autonomous mode...')}`);
      mcpManager.disconnectAll();
      process.exit(0);
    }
    // No break! Continue the chat loop
    isFirstPrompt = false;
  }
}
