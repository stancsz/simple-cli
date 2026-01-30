#!/usr/bin/env node
/**
 * Simple-CLI Orchestrator - Core loop: Observe -> Plan -> Verify -> Act -> Reflect
 * Must remain under 150 lines. Supports MoE routing with --moe flag.
 */
import 'dotenv/config';
import * as readline from 'readline';
import { generateRepoMap } from './repoMap.js';
import { loadTools, type Tool } from './registry.js';
import { createProvider } from './providers/index.js';
import { createMultiProvider } from './providers/multi.js';
import { routeTask, loadTierConfig, formatRoutingDecision, type Tier } from './router.js';
import { getPromptProvider } from './prompts/provider.js';

const YOLO_MODE = process.argv.includes('--yolo');
const MOE_MODE = process.argv.includes('--moe');
let tools: Map<string, Tool>;
let history: Array<{ role: string; content: string }> = [];

const buildPrompt = async (): Promise<string> => {
  const repoMap = await generateRepoMap();
  const toolDefs = Array.from(tools.values()).map(t => `- ${t.name}: ${t.description}`).join('\n');
  const provider = getPromptProvider();
  const systemPrompt = await provider.getSystemPrompt({ cwd: process.cwd() });

  return `${systemPrompt}

## REQUIRED OUTPUT FORMAT
You must ALWAYS respond using this exact format:
<thought>
Your internal reasoning and plan.
</thought>
{"tool": "toolName", "args": {...}}

If no tool is needed, use:
<thought>
Reasoning.
</thought>
{"tool": "none", "message": "Your message to the user"}

## AVAILABLE TOOLS
${toolDefs}

## CONTEXT
${repoMap}`;
};

import { jsonrepair } from 'jsonrepair';

const parseResponse = (r: string) => {
  const thought = r.match(/<thought>([\s\S]*?)<\/thought>/)?.[1]?.trim() || '';
  const jsonMatch = r.match(/\{[\s\S]*"tool"[\s\S]*\}/);
  let action = { tool: 'none', message: 'No action', args: {} as Record<string, unknown> };
  if (jsonMatch) {
    try {
      const repaired = jsonrepair(jsonMatch[0]);
      action = JSON.parse(repaired);
    } catch { /* use default */ }
  }
  return { thought, action };
};

const confirm = async (tool: string, args: Record<string, unknown>): Promise<boolean> => {
  if (YOLO_MODE) return true;
  const t = tools.get(tool);
  if (!t || t.permission === 'read') return !!t;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(res => {
    rl.question(`[CONFIRM] ${tool}(${JSON.stringify(args)})? (y/n) `, a => { rl.close(); res(a.toLowerCase() === 'y'); });
  });
};

const execTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
  const t = tools.get(name);
  if (!t) return `Error: Tool "${name}" not found`;
  try { const r = await t.execute(args); return typeof r === 'string' ? r : JSON.stringify(r, null, 2); }
  catch (e) { return `Error: ${e instanceof Error ? e.message : e}`; }
};

const main = async (): Promise<void> => {
  console.log(`Simple-CLI v0.1.0 ${MOE_MODE ? '[MoE]' : ''} ${YOLO_MODE ? '[YOLO]' : '[Safe]'}`);
  tools = await loadTools();
  const systemPrompt = await buildPrompt();
  const tierConfigs = MOE_MODE ? loadTierConfig() : null;
  const multiProvider = tierConfigs ? createMultiProvider(tierConfigs) : null;
  const singleProvider = !MOE_MODE ? createProvider() : null;

  const generate = async (input: string): Promise<string> => {
    if (MOE_MODE && multiProvider && tierConfigs) {
      const routing = await routeTask(input, (p) => multiProvider.generateWithTier(1, p, [{ role: 'user', content: input }]));
      console.log(formatRoutingDecision(routing, tierConfigs));
      return multiProvider.generateWithTier(routing.tier as Tier, systemPrompt, history);
    }
    return singleProvider!.generateResponse(systemPrompt, history);
  };

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const prompt = (): void => {
    rl.question('\n> ', async (input) => {
      if (input.toLowerCase() === 'exit') { rl.close(); return; }
      history.push({ role: 'user', content: input });
      const response = await generate(input);
      const { thought, action } = parseResponse(response);
      console.log(`\n[Thought] ${thought}`);
      if (action.tool !== 'none') {
        if (await confirm(action.tool, action.args || {})) {
          const result = await execTool(action.tool, action.args || {});
          console.log(`[Result] ${result}`);
          history.push({ role: 'assistant', content: response }, { role: 'user', content: `Tool result: ${result}` });
        } else console.log('[Skipped]');
      } else {
        console.log(`[Response] ${action.message}`);
        history.push({ role: 'assistant', content: response });
      }
      prompt();
    });
  };
  prompt();
};
main().catch(console.error);
