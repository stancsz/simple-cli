#!/usr/bin/env node
import "dotenv/config";
import { statSync, existsSync, appendFileSync } from "fs";
import { join } from "path";
import { Engine, Context, Registry } from "./engine.js";
import { allBuiltins } from "./builtins.js";
import { createLLM } from "./llm.js";
import { MCP } from "./mcp.js";
import { getActiveSkill } from "./skills.js";
import { showBanner } from "./tui.js";
import { Scheduler } from "./scheduler.js";
import { log, outro } from "@clack/prompts";
import pc from "picocolors";

async function main() {
  const args = process.argv.slice(2);

  // Handle optional directory argument
  let cwd = process.cwd();
  let interactive = true;
  let daemon = false;
  let clawTask = null;
  const remainingArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--claw") {
      if (i + 1 < args.length) {
        clawTask = args[i + 1];
        i++; // Consume next arg
        continue;
      } else {
        console.error(pc.red("Error: --claw requires a task argument."));
        process.exit(1);
      }
    }

    if (arg === "--non-interactive") {
      interactive = false;
      continue;
    }
    if (arg === "--daemon") {
      daemon = true;
      interactive = false;
      continue;
    }
    if (!arg.startsWith("-")) {
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

  // Handle Claw Task Injection immediately
  if (clawTask) {
    const heartbeatFile = join(cwd, "HEARTBEAT.md");
    try {
      // If file doesn't exist, maybe add a header? Or just append.
      // User said "inject a task into OpenClaw's HEARTBEAT.md".
      // Assuming simple markdown checklist format.
      const taskEntry = `- [ ] ${clawTask}\n`;
      appendFileSync(heartbeatFile, taskEntry, "utf8");

      console.log(pc.green(`✔ Task injected into HEARTBEAT.md: "${clawTask}"`));
      process.exit(0);
    } catch (e: any) {
      console.error(
        pc.red(`Error injecting task into HEARTBEAT.md: ${e.message}`),
      );
      process.exit(1);
    }
  }

  const prompt = remainingArgs.filter((a) => !a.startsWith("-")).join(" ");

  const registry = new Registry();
  allBuiltins.forEach((t) => registry.tools.set(t.name, t as any));
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
      log.info("All scheduled tasks processed.");
    }
  };

  if (daemon) {
    showBanner();
    log.info("Running in daemon mode. Checking for tasks every 60s...");

    while (true) {
      try {
        await processDueTasks();
      } catch (e: any) {
        log.error(`Error in daemon loop: ${e.message}`);
      }
      // Sleep for 60 seconds
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }
  } else {
    showBanner();
    // Standard run: check tasks once, then interactive
    await processDueTasks();

    const skill = await getActiveSkill(cwd);
    const ctx = new Context(cwd, skill);

    await engine.run(ctx, prompt || undefined, { interactive });
    outro("Session finished.");
  }
}

main().catch(console.error);
