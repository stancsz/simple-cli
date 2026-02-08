#!/usr/bin/env node
import 'dotenv/config';
import { statSync } from 'fs';
import { Engine, Context, Registry } from './engine.js';
import { allBuiltins } from './builtins.js';
import { createLLM } from './llm.js';
import { MCP } from './mcp.js';
import { getActiveSkill } from './skills.js';
import { showBanner } from './tui.js';
import { Scheduler } from './scheduler.js';

async function main() {
  const args = process.argv.slice(2);

  // Handle optional directory argument
  let cwd = process.cwd();
  let interactive = true;
  let daemon = false;
  const remainingArgs = [];

  for (const arg of args) {
      if (arg === '--non-interactive') {
          interactive = false;
          continue;
      }
      if (arg === '--daemon') {
          daemon = true;
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

  // --- Scheduler Integration ---
  const scheduler = Scheduler.getInstance(cwd);

  const processDueTasks = async () => {
      const dueTasks = await scheduler.getDueTasks();
      if (dueTasks.length > 0) {
          console.log(`⏰ Found ${dueTasks.length} scheduled tasks due.`);
          for (const task of dueTasks) {
              console.log(`Running task: ${task.description} (${task.cron})`);
              // Use a fresh context for each task
              const taskCtx = new Context(cwd, await getActiveSkill(cwd));
              try {
                  // Run non-interactively
                  await engine.run(taskCtx, task.prompt, { interactive: false });
                  await scheduler.markTaskRun(task.id, true);
                  console.log(`Task ${task.id} completed.`);
              } catch (e: any) {
                  console.error(`Task ${task.id} failed: ${e.message}`);
                  await scheduler.markTaskRun(task.id, false);
              }
          }
          console.log('All scheduled tasks processed.');
      }
  };

  if (daemon) {
      console.log('Running in daemon mode. Checking for tasks every 60s...');
      showBanner();

      while (true) {
          try {
              await processDueTasks();
          } catch (e) {
              console.error('Error in daemon loop:', e);
          }
          // Sleep for 60 seconds
          await new Promise(resolve => setTimeout(resolve, 60000));
      }
  } else {
      // Standard run: check tasks once, then interactive
      await processDueTasks();

      const skill = await getActiveSkill(cwd);
      const ctx = new Context(cwd, skill);

      showBanner();

      await engine.run(ctx, prompt || undefined, { interactive });
  }
}

main().catch(console.error);
