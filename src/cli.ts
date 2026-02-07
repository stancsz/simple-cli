#!/usr/bin/env node
/**
 * Simple-CLI - Premium TUI agentic coding assistant
 * Powered by @clack/prompts.
 */
import 'dotenv/config';
import { text, isCancel, select } from '@clack/prompts';
import pc from 'picocolors';
import { getContextManager } from './context.js';
import { createProvider, createProviderForModel } from './providers/index.js';
import { getMCPManager } from './mcp/manager.js';
import { readFileSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { SimpleCoreExecutor } from './executors/simple.js';
import { executeTool } from './executors/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI flags
const GHOST_MODE = process.argv.includes('--ghost');
const YOLO_MODE = process.argv.includes('--yolo') || GHOST_MODE;
const DEBUG = process.argv.includes('--debug') || process.env.DEBUG === 'true';
const VERSION = '0.3.0';

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
    --codex            Use Codex (auto-selects model based on complexity)
    --gemini           Use Gemini
    --claude           Use Claude
    --debug            Enable debug logging

  ${pc.bold('Examples:')}
    simple . "Build a login page"
    simple --codex "Refactor this file"
  `);
  process.exit(0);
}

async function main(): Promise<void> {
  const originalCwd = process.cwd();
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('-'));
  let targetDir = originalCwd;

  // Handle --invoke
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
        const { config } = await import('dotenv');
        config();
        args.shift();
      }
    } catch { /* ignored */ }
  }

  const useGemini = process.argv.includes('--gemini');
  const useClaude = process.argv.includes('--claude');
  const useCodex = process.argv.includes('--codex');

  const ctx = getContextManager(targetDir);

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

  // Determine initial provider
  let singleProvider;
  if (useGemini) {
      singleProvider = createProviderForModel('gemini:gemini-pro');
  } else if (useClaude) {
      singleProvider = createProviderForModel('anthropic:claude-3-opus-20240229');
  } else if (useCodex) {
      singleProvider = createProviderForModel('openai:gpt-5.1-codex-mini'); // Start with simple, will router later
  } else {
      singleProvider = createProvider();
  }

  const executor = new SimpleCoreExecutor(
      singleProvider,
      mcpManager,
      {
        ghost: GHOST_MODE,
        yolo: YOLO_MODE,
        debug: DEBUG,
        nonInteractive: NON_INTERACTIVE
      }
  );

  await executor.execute({
      targetDir,
      initialPrompt: args.join(' '),
      ctx
  });
}

main().catch(console.error);
