#!/usr/bin/env node
import 'dotenv/config';
import { statSync } from 'fs';
import { Engine, Context, Registry } from './engine.js';
import { allBuiltins } from './builtins.js';
import { createLLM } from './llm.js';
import { MCP } from './mcp.js';
import { getActiveSkill } from './skills.js';
import { showBanner } from './tui.js';

async function main() {
  const args = process.argv.slice(2);

  // Handle optional directory argument
  let cwd = process.cwd();
  let interactive = true;
  const remainingArgs = [];

  for (const arg of args) {
      if (arg === '--non-interactive') {
          interactive = false;
          continue;
      }
      if (!arg.startsWith('-')) {
          try {
              if (statSync(arg).isDirectory()) {
                  cwd = arg;
                  process.chdir(cwd);
                  continue;
              }
          } catch {}
      }
      remainingArgs.push(arg);
  }

  const prompt = remainingArgs.filter(a => !a.startsWith('-')).join(' ');

  const registry = new Registry();
  allBuiltins.forEach(t => registry.tools.set(t.name, t as any));
  await registry.loadProjectTools(cwd);

  const mcp = new MCP();
  const provider = createLLM();
  const engine = new Engine(provider, registry, mcp);

  const skill = await getActiveSkill(cwd);
  const ctx = new Context(cwd, skill);

  showBanner();

  await engine.run(ctx, prompt || undefined, { interactive });
}

main().catch(console.error);
