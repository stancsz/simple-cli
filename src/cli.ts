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
import { readFileSync, existsSync } from 'fs';
import { runSwarm, parseSwarmArgs, printSwarmHelp } from './commands/swarm.js';
import { jsonrepair } from 'jsonrepair';

// CLI flags
const YOLO_MODE = process.argv.includes('--yolo');
const MOE_MODE = process.argv.includes('--moe');
const SWARM_MODE = process.argv.includes('--swarm');
const DEBUG = process.argv.includes('--debug') || process.env.DEBUG === 'true';
const VERSION = '0.2.0';

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

function loadAgentRules(): string {
  const paths = ['./AGENT.md', './.agent.md', './.aider/agent.md'];
  for (const path of paths) {
    if (existsSync(path)) return readFileSync(path, 'utf-8');
  }
  return '';
}

async function main(): Promise<void> {
  console.clear();
  intro(pc.bgCyan(pc.black(' SIMPLE-CLI ')) + pc.dim(` v${VERSION} ${MOE_MODE ? pc.yellow('[MoE]') : ''} ${YOLO_MODE ? pc.red('[YOLO]') : pc.green('[Safe]')}`));

  const s = clackSpinner();
  s.start('Initializing context and tools...');

  const ctx = getContextManager();
  await ctx.initialize();

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

  s.stop('Architecture ready.');

  const generate = async (input: string): Promise<string> => {
    const history = ctx.getHistory();
    const systemPrompt = await ctx.buildSystemPrompt();
    const rules = loadAgentRules();
    const fullPrompt = rules ? `${systemPrompt}\n\n## Project Rules\n${rules}` : systemPrompt;

    if (MOE_MODE && multiProvider && tierConfigs) {
      const routing = await routeTask(input, async (prompt) => {
        return multiProvider.generateWithTier(1, prompt, [{ role: 'user', content: input }]);
      });
      if (DEBUG) note(formatRoutingDecision(routing, tierConfigs), 'Routing');
      return multiProvider.generateWithTier(routing.tier as Tier, fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
    }

    return singleProvider!.generateResponse(fullPrompt, history.map(m => ({ role: m.role, content: m.content })));
  };

  let isFirstPrompt = true;

  while (true) {
    const skill = getActiveSkill();
    let input: string | symbol;

    // Support initial prompt from command line
    const args = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
    if (isFirstPrompt && args.length > 0) {
      input = args.join(' ');
      note(input, pc.cyan('Initial Task'));
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
      outro('Goodbye!');
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
            output: (m) => note(m, 'Output'),
            error: (m) => note(m, pc.red('Error')),
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
        note(pc.red(String(err)), 'Command Error');
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
          note(`Switched to @${newSkill.name} skill`, 'Skill');
        } else {
          note(`Skill @${skillName} not found.`, pc.red('Error'));
        }
      }
      continue;
    }

    ctx.addMessage('user', trimmedInput);

    let steps = 0;
    while (steps < 15) {
      s.start('Thinking...');
      const response = await generate(trimmedInput);
      const { thought, action } = parseResponse(response);
      s.stop('Thought complete.');

      if (thought) note(thought, pc.cyan('Thought'));

      if (action.tool !== 'none') {
        if (await confirm(action.tool, action.args || {}, ctx)) {
          s.start(`Executing ${pc.cyan(action.tool)}...`);
          const result = await executeTool(action.tool, action.args || {}, ctx);
          s.stop(`Tool ${pc.cyan(action.tool)} finished.`);

          note(result.length > 1000 ? result.slice(0, 1000) + '...' : result, pc.green('Result'));

          ctx.addMessage('assistant', response);
          ctx.addMessage('user', `Tool result: ${result}`);
          steps++;
        } else {
          note('Operation cancelled.', pc.yellow('Skipped'));
          ctx.addMessage('assistant', response);
          break;
        }
      } else {
        const msg = action.message || response.replace(/<thought>[\s\S]*?<\/thought>/, '').trim();
        if (msg) note(msg, pc.magenta('Simple-CLI'));
        ctx.addMessage('assistant', response);
        break;
      }
    }
  }
}
