#!/usr/bin/env node
/**
 * Simple-CLI - Premium TUI agentic coding assistant
 * Powered by @clack/prompts.
 */
import 'dotenv/config';
import pc from 'picocolors';
import { getContextManager } from './context.js';
import { createProvider } from './providers/index.js';
import { createMultiProvider } from './providers/multi.js';
import { loadTierConfig } from './router.js';
import { getMCPManager } from './mcp/manager.js';
import { readFileSync, statSync } from 'fs';
import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runSwarm, parseSwarmArgs, printSwarmHelp } from './commands/swarm.js';
import { runDeterministicOrganizer } from './tools/organizer.js';

import { SimpleCoreExecutor } from './executors/simple.js';
import { CodexExecutor } from './executors/codex.js';
import { GeminiExecutor } from './executors/gemini.js';
import { ClaudeExecutor } from './executors/claude.js';
import { AiderExecutor } from './executors/aider.js';
import { Executor } from './executors/types.js';
import { executeTool } from './executors/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Deterministic organizer moved to src/tools/organizer.ts

// CLI flags
const MOE_MODE = process.argv.includes('--moe');
const SWARM_MODE = process.argv.includes('--swarm');
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
    --codex            Use OpenAI Codex CLI
    --gemini           Use Google Gemini CLI
    --claude           Use Claude Code CLI
    --aider            Use Aider AI Pair Programmer
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

  const useCodex = process.argv.includes('--codex');
  const useGemini = process.argv.includes('--gemini');
  const useClaude = process.argv.includes('--claude');
  const useAider = process.argv.includes('--aider');

  let executor: Executor;
  const ctx = getContextManager(targetDir);

  if (useCodex) {
    executor = new CodexExecutor();
  } else if (useGemini) {
    executor = new GeminiExecutor();
  } else if (useClaude) {
    executor = new ClaudeExecutor();
  } else if (useAider) {
    executor = new AiderExecutor();
  } else {
    // Simple Core Setup
    if (!GHOST_MODE) {
       console.log(`\n ${pc.bgCyan(pc.black(' SIMPLE-CLI '))} ${pc.dim(`v${VERSION}`)} ${pc.green('●')} ${pc.cyan(targetDir)}\n`);
       console.log(`${pc.dim('○')} Initializing...`);
    }

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

    executor = new SimpleCoreExecutor(
        singleProvider,
        multiProvider,
        tierConfigs,
        mcpManager,
        {
          moe: MOE_MODE,
          claw: CLAW_MODE,
          ghost: GHOST_MODE,
          yolo: YOLO_MODE,
          debug: DEBUG,
          nonInteractive: NON_INTERACTIVE,
          clawIntent
        }
    );
  }

  await executor.execute({
      targetDir,
      initialPrompt: args.join(' '),
      ctx
  });
}
