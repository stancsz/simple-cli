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
import { log, outro } from '@clack/prompts';

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
          log.info(`Found ${dueTasks.length} scheduled tasks due.`);
          for (const task of dueTasks) {
              log.step(`Running task: ${task.description} (${task.cron})`);
              // Use a fresh context for each task
              const taskCtx = new Context(cwd, await getActiveSkill(cwd));
              try {
                  // Run non-interactively
                  await engine.run(taskCtx, task.prompt, { interactive: false });
                  await scheduler.markTaskRun(task.id, true);
                  log.success(`Task ${task.id} completed.`);
              } catch (e: any) {
                  log.error(`Task ${task.id} failed: ${e.message}`);
                  await scheduler.markTaskRun(task.id, false);
              }
          }
          log.info('All scheduled tasks processed.');
      }
  };

  if (daemon) {
      showBanner();
      log.info('Running in daemon mode. Checking for tasks every 60s...');

      while (true) {
          try {
              await processDueTasks();
          } catch (e: any) {
              log.error(`Error in daemon loop: ${e.message}`);
          }
          // Sleep for 60 seconds
          await new Promise(resolve => setTimeout(resolve, 60000));
      }
  } else {
      showBanner();
      // Standard run: check tasks once, then interactive
      await processDueTasks();

      const skill = await getActiveSkill(cwd);
      const ctx = new Context(cwd, skill);

      await engine.run(ctx, prompt || undefined, { interactive });
      outro('Session finished.');
  }
}

main().catch(console.error);
