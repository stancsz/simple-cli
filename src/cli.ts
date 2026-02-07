#!/usr/bin/env node
import 'dotenv/config';
import pc from 'picocolors';
import { statSync } from 'fs';
import { Engine, Context, Registry } from './engine.js';
import { allBuiltins } from './builtins.js';
import { createLLM } from './llm.js';
import { MCP } from './mcp.js';

async function main() {
  const args = process.argv.slice(2);

  // Handle optional directory argument
  let cwd = process.cwd();
  const remainingArgs = [];

  for (const arg of args) {
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

  const defaultSkill = {
    name: 'code',
    systemPrompt: `You are a helpful coding assistant. Use tools to solve tasks.
You must output your response in JSON format.
The JSON should have the following structure:
{
  "thought": "Your reasoning here",
  "tool": "tool_name",
  "args": { "arg_name": "value" }
}
If you don't need to use a tool, use "tool": "none" and provide a "message".
{
  "thought": "Reasoning",
  "tool": "none",
  "message": "Response to user"
}
Important:
- If a task requires multiple steps, perform them one by one.
- Do not ask for confirmation if you have enough information to proceed.
- When writing to files that might exist (like logs), read them first and append to them if necessary, unless instructed to overwrite.
`
  };

  const ctx = new Context(cwd, defaultSkill);

  console.log(`\n ${pc.bgCyan(pc.black(' SIMPLE-CLI '))} ${pc.dim('v0.4.0')}\n`);

  await engine.run(ctx, prompt || undefined);
}

main().catch(console.error);
