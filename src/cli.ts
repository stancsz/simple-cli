#!/usr/bin/env node
/**
 * Simple-CLI - Enhanced agentic coding assistant
 * Integrates: MoE routing, MCP tools, skills, file watching, swarm, and commands
 */

import 'dotenv/config';
import * as readline from 'readline';
import { ContextManager, getContextManager } from './context.js';
import { createProvider } from './providers/index.js';
import { createMultiProvider } from './providers/multi.js';
import { routeTask, loadTierConfig, formatRoutingDecision, type Tier } from './router.js';
import { executeCommand, parseCommand } from './commands.js';
import { getMCPManager } from './mcp/manager.js';
import { FileWatcher, createFileWatcher } from './watcher.js';
import { listSkills, setActiveSkill, getActiveSkill } from './skills.js';
import { readFileSync, existsSync } from 'fs';
import { runSwarm, parseSwarmArgs, printSwarmHelp } from './commands/swarm.js';

// CLI flags
const YOLO_MODE = process.argv.includes('--yolo');
const MOE_MODE = process.argv.includes('--moe');
const WATCH_MODE = process.argv.includes('--watch');
const SWARM_MODE = process.argv.includes('--swarm');
const UI_MODE = process.argv.includes('--ui') || process.argv.includes('-ui');
const DEBUG = process.argv.includes('--debug') || process.env.DEBUG === 'true';

// Handle --ui mode
if (UI_MODE) {
  import('./ui/server.js').then(({ startServer }) => {
    startServer({ port: 3000, host: 'localhost' }).catch(err => {
      console.error('UI Server error:', err);
      process.exit(1);
    });
  });
} else if (SWARM_MODE) {
  // Handle --swarm mode
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
  // Continue with normal CLI
  startCli();
}

// Version
const VERSION = '0.1.0';

// Start the interactive CLI
function startCli(): void {
  main().catch(console.error);
}

// Banner
function printBanner(): void {
  const modes = [
    MOE_MODE ? '[MoE]' : '[Single]',
    YOLO_MODE ? '[YOLO]' : '[Safe]',
    WATCH_MODE ? '[Watch]' : '',
  ].filter(Boolean).join(' ');

  console.log(`
╔═══════════════════════════════════════════╗
║  Simple-CLI v${VERSION}                        ║
║  Agentic coding assistant with MCP/MoE    ║
╠═══════════════════════════════════════════╣
║  Commands: /help, --swarm for swarm mode  ║
║  Modes: ${modes.padEnd(32)}║
╚═══════════════════════════════════════════╝
`);
}

// Parse LLM response
function parseResponse(response: string): { thought: string; action: { tool: string; args?: Record<string, unknown>; message?: string } } {
  const thought = response.match(/<thought>([\s\S]*?)<\/thought>/)?.[1]?.trim() || '';
  const jsonMatch = response.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  let action = { tool: 'none', message: 'No action', args: {} as Record<string, unknown> };
  if (jsonMatch) {
    try {
      action = JSON.parse(jsonMatch[0]);
    } catch {
      // Keep default
    }
  }
  return { thought, action };
}

// Confirm tool execution
async function confirm(
  rl: readline.Interface,
  tool: string,
  args: Record<string, unknown>,
  ctx: ContextManager
): Promise<boolean> {
  if (YOLO_MODE) return true;

  const t = ctx.getTools().get(tool);
  if (!t) return false;
  if (t.permission === 'read') return true;

  return new Promise((resolve) => {
    rl.question(`[CONFIRM] ${tool}(${JSON.stringify(args)})? (y/n) `, (answer) => {
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Execute tool
async function executeTool(name: string, args: Record<string, unknown>, ctx: ContextManager): Promise<string> {
  const tools = ctx.getTools();
  const tool = tools.get(name);

  if (!tool) {
    return `Error: Tool "${name}" not found`;
  }

  try {
    const result = await tool.execute(args);
    return typeof result === 'string' ? result : JSON.stringify(result, null, 2);
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : error}`;
  }
}

// Load AGENT.md rules
function loadAgentRules(): string {
  const paths = ['./AGENT.md', './.agent.md', './.aider/agent.md'];
  for (const path of paths) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
  }
  return '';
}

// Main CLI loop
async function main(): Promise<void> {
  printBanner();

  // Initialize context
  const ctx = getContextManager();
  await ctx.initialize();
  console.log(`Loaded ${ctx.getTools().size} tools`);

  // Initialize MCP if configured
  const mcpManager = getMCPManager();
  try {
    const configs = await mcpManager.loadConfig();
    if (configs.length > 0) {
      console.log(`Connecting to ${configs.length} MCP server(s)...`);
      await mcpManager.connectAll(configs);
    }
  } catch (error) {
    if (DEBUG) console.error('MCP init error:', error);
  }

  // Initialize providers
  const tierConfigs = MOE_MODE ? loadTierConfig() : null;
  const multiProvider = tierConfigs ? createMultiProvider(tierConfigs) : null;
  const singleProvider = !MOE_MODE ? createProvider() : null;

  // Initialize file watcher
  let watcher: FileWatcher | null = null;
  if (WATCH_MODE) {
    watcher = createFileWatcher({
      root: ctx.getCwd(),
      onAIComment: (path, comments) => {
        console.log(`\n[Watch] AI comments detected in ${path}`);
        for (const c of comments) {
          console.log(`  Line ${c.line}: ${c.text}`);
        }
      },
    });
    console.log('File watcher active');
  }

  // Generate response
  const generate = async (input: string): Promise<string> => {
    const history = ctx.getHistory();
    const systemPrompt = await ctx.buildSystemPrompt();
    const rules = loadAgentRules();
    const fullPrompt = rules ? `${systemPrompt}\n\n## Project Rules\n${rules}` : systemPrompt;

    if (MOE_MODE && multiProvider && tierConfigs) {
      // Route to appropriate tier
      const routing = await routeTask(input, async (prompt) => {
        return multiProvider.generateWithTier(1, prompt, [{ role: 'user', content: input }]);
      });

      if (DEBUG) console.log(formatRoutingDecision(routing, tierConfigs));

      return multiProvider.generateWithTier(
        routing.tier as Tier,
        fullPrompt,
        history.map(m => ({ role: m.role, content: m.content }))
      );
    }

    return singleProvider!.generateResponse(
      fullPrompt,
      history.map(m => ({ role: m.role, content: m.content }))
    );
  };

  // IO functions for commands
  const io = {
    output: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(`[Error] ${msg}`),
    confirm: async (msg: string): Promise<boolean> => {
      return new Promise((resolve) => {
        rl.question(`${msg} (y/n) `, (answer) => resolve(answer.toLowerCase() === 'y'));
      });
    },
    prompt: async (msg: string): Promise<string> => {
      return new Promise((resolve) => {
        rl.question(msg, resolve);
      });
    },
  };

  // Command context
  const cmdContext = {
    cwd: ctx.getCwd(),
    activeFiles: ctx.getState().activeFiles,
    readOnlyFiles: ctx.getState().readOnlyFiles,
    history: ctx.getHistory(),
    io,
  };

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Handle Ctrl+C gracefully
  rl.on('close', () => {
    console.log('\nGoodbye!');
    watcher?.stop();
    mcpManager.disconnectAll();
    process.exit(0);
  });

  // Main prompt loop
  const prompt = (): void => {
    const skill = getActiveSkill();
    const promptText = `\n[${skill.name}]> `;

    rl.question(promptText, async (input) => {
      input = input.trim();

      if (!input) {
        prompt();
        return;
      }

      // Handle slash commands
      if (input.startsWith('/')) {
        try {
          await executeCommand(input, cmdContext);
        } catch (error) {
          console.error(`[Error] ${error instanceof Error ? error.message : error}`);
        }
        prompt();
        return;
      }

      // Handle skill switching
      if (input.startsWith('@')) {
        const skillName = input.slice(1).trim();
        if (skillName === 'list') {
          console.log('\nAvailable skills:');
          for (const s of listSkills()) {
            const marker = s.name === skill.name ? '* ' : '  ';
            console.log(`${marker}@${s.name} - ${s.description}`);
          }
        } else {
          const newSkill = setActiveSkill(skillName);
          if (newSkill) {
            ctx.setSkill(newSkill);
            console.log(`Switched to @${newSkill.name} skill`);
          } else {
            console.log(`Unknown skill: @${skillName}. Use @list to see available skills.`);
          }
        }
        prompt();
        return;
      }

      // Check for watch mode triggers
      if (watcher) {
        const watchPrompt = watcher.getActionableCommentsPrompt();
        if (watchPrompt) {
          input = `${watchPrompt}\n\nUser request: ${input}`;
        }
      }

      // Add to context history
      ctx.addMessage('user', input);

      try {
        // Generate response
        console.log('\nThinking...');
        const response = await generate(input);
        const { thought, action } = parseResponse(response);

        // Display thought
        if (thought) {
          console.log(`\n[Thought] ${thought}`);
        }

        // Handle action
        if (action.tool !== 'none') {
          const args = action.args || {};

          if (await confirm(rl, action.tool, args, ctx)) {
            console.log(`[Action] ${action.tool}`);
            const result = await executeTool(action.tool, args, ctx);
            console.log(`[Result] ${result.slice(0, 1000)}${result.length > 1000 ? '...' : ''}`);

            // Update history with result
            ctx.addMessage('assistant', response);
            ctx.addMessage('user', `Tool result: ${result}`);
          } else {
            console.log('[Skipped]');
            ctx.addMessage('assistant', response);
          }
        } else {
          console.log(`\n${action.message || 'No response'}`);
          ctx.addMessage('assistant', response);
        }
      } catch (error) {
        console.error(`[Error] ${error instanceof Error ? error.message : error}`);
        if (DEBUG && error instanceof Error) {
          console.error(error.stack);
        }
      }

      prompt();
    });
  };

  // Start the prompt loop
  prompt();
}

// Run
main().catch(console.error);
