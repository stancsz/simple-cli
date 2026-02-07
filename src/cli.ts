#!/usr/bin/env node
import 'dotenv/config';
import pc from 'picocolors';
import { Engine, Context, Registry } from './engine.js';
import { allBuiltins } from './builtins.js';
import { createLLM } from './llm.js';
import { MCP } from './mcp.js';

async function main() {
  const args = process.argv.slice(2);
  const prompt = args.find(a => !a.startsWith('-'));

  const registry = new Registry();
  allBuiltins.forEach(t => registry.tools.set(t.name, t as any));
  await registry.loadProjectTools(process.cwd());

  const mcp = new MCP();
  const provider = createLLM();
  const engine = new Engine(provider, registry, mcp);

  const defaultSkill = {
    name: 'code',
    systemPrompt: 'You are a helpful coding assistant. Use tools to solve tasks.'
  };

  const ctx = new Context(process.cwd(), defaultSkill);

  console.log(`\n ${pc.bgCyan(pc.black(' SIMPLE-CLI '))} ${pc.dim('v0.4.0')}\n`);

  await engine.run(ctx, prompt);
}

main().catch(console.error);
