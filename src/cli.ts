#!/usr/bin/env node
import "dotenv/config";
import { statSync } from "fs";
import { Engine, Context, Registry } from "./engine/orchestrator.js";
import { createLLM } from "./llm.js";
import { MCP } from "./mcp.js";
import { getActiveSkill } from "./skills.js";
import { showBanner } from "./tui.js";
import { outro } from "@clack/prompts";
import { WorkflowEngine } from "./workflows/workflow_engine.js";
import { SOPRegistry } from "./workflows/sop_registry.js";
import { createExecuteSOPTool } from "./workflows/execute_sop_tool.js";
import { Briefcase, createSwitchCompanyTool } from "./context/briefcase.js";
import { loadConfig } from "./config.js";

async function main() {
  const args = process.argv.slice(2);

  // Capture initial CWD before any chdir
  const initialCwd = process.cwd();

  // Handle optional directory argument
  let cwd = initialCwd;
  let interactive = true;
  let startDaemon = false;
  const remainingArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--daemon") {
      startDaemon = true;
      continue;
    }

    if (arg === "--non-interactive") {
      interactive = false;
      continue;
    }

    if (arg === "--company") {
      if (i + 1 < args.length) {
        process.env.JULES_COMPANY = args[i + 1];
        i++; // Consume next arg
        continue;
      }
    }

    if (arg === "--interface") {
      if (i + 1 < args.length) {
        const interfaceName = args[i + 1];
        i++; // Consume next arg

        if (interfaceName === "discord") {
          try {
            const { start } = await import("./interfaces/discord.js");
            await start();
            return; // Exit main, interface takes over
          } catch (e: any) {
            console.error("Failed to start Discord interface:", e);
            process.exit(1);
          }
        }
        continue;
      }
    }

    if (!arg.startsWith("-")) {
      try {
        if (statSync(arg).isDirectory()) {
          cwd = arg;
          process.chdir(cwd);
          continue;
        }
      } catch { }
    }
    remainingArgs.push(arg);
  }

  if (startDaemon) {
    try {
      const { daemon } = await import("./daemon/daemon_cli.js");
      await daemon.start();
    } catch (e: any) {
      console.error("Failed to load daemon module:", e.message);
    }
    return;
  }

  if (remainingArgs[0] === "onboard") {
    try {
      const { runOnboard } = await import("./commands/onboard.js");
      await runOnboard();
    } catch (e: any) {
      console.error("Failed to execute onboard wizard:", e);
    }
    return;
  }

  if (remainingArgs[0] === "quick-start" || remainingArgs[0] === "quickstart") {
    try {
      // Check for legacy flags to maintain backward compatibility
      const isLegacy = args.includes("--scenario") || args.includes("--demo-mode");

      if (isLegacy) {
        const { quickStart } = await import("./commands/quick-start.js");
        let scenario;
        let demoMode = false;
        const originalArgs = process.argv.slice(2);
        for (let i = 0; i < originalArgs.length; i++) {
          if (originalArgs[i] === "--scenario" && i + 1 < originalArgs.length) {
            scenario = originalArgs[i + 1];
          }
          if (originalArgs[i] === "--demo-mode") {
            demoMode = true;
          }
        }
        await quickStart(scenario, demoMode);
      } else {
        const { runQuickStart } = await import("./commands/quickstart.js");
        await runQuickStart();
      }
    } catch (e: any) {
      console.error("Failed to execute quick-start wizard:", e);
    }
    return;
  }

  if (remainingArgs[0] === "onboard-company") {
    try {
      const { onboardCompany } = await import("./commands/onboard-company.js");
      const companyName = remainingArgs[1];
      await onboardCompany(companyName);
    } catch (e: any) {
      console.error("Failed to execute onboard-company:", e);
    }
    return;
  }

  if (remainingArgs[0] === "init-company") {
    try {
      const { initCompany } = await import("./commands/init-company.js");
      const companyName = remainingArgs[1];
      await initCompany(companyName);
    } catch (e: any) {
      console.error("Failed to execute init-company:", e);
    }
    return;
  }

  if (remainingArgs[0] === "company") {
    try {
      const { companyCommand } = await import("./commands/company.js");
      const subcommand = remainingArgs[1];
      const args = remainingArgs.slice(2);
      await companyCommand(subcommand, ...args);
    } catch (e: any) {
      console.error("Failed to execute company command:", e);
    }
    return;
  }

  if (remainingArgs[0] === "dashboard") {
      try {
          const { dashboardCommand } = await import("./commands/dashboard.js");
          await dashboardCommand();
      } catch (e: any) {
          console.error("Failed to start dashboard:", e);
      }
      return;
  }

  if (remainingArgs[0] === "daemon") {
    try {
      const { daemon } = await import("./daemon/daemon_cli.js");
      const subCmd = remainingArgs[1];
      if (subCmd === "start") await daemon.start();
      else if (subCmd === "stop") await daemon.stop();
      else if (subCmd === "status") await daemon.status();
      else console.log("Usage: simple daemon <start|stop|status>");
    } catch (e: any) {
      console.error("Failed to load daemon module:", e.message);
    }
    return;
  }

  const prompt = remainingArgs.filter((a) => !a.startsWith("-")).join(" ");

  const registry = new Registry();

  // Initialize Workflow Engine and register execute_sop tool
  const sopRegistry = new SOPRegistry();
  const workflowEngine = new WorkflowEngine(registry, sopRegistry);
  const sopTool = createExecuteSOPTool(workflowEngine);
  registry.tools.set(sopTool.name, sopTool as any);

  const mcp = new MCP();

  // Auto-start core local servers to maintain default capabilities
  await mcp.init();
  // Ensure essential servers are running.
  // 'filesystem' and 'git' should be configured in mcp.json via migration.
  const coreServers = ["filesystem", "git", "context_server", "company_context", "claude-server", "picoclaw"];
  for (const s of coreServers) {
    try {
      if (mcp.isServerRunning(s)) continue; // Already running
      await mcp.startServer(s);
    } catch (e: any) {
      // Server might not be discovered or failed to start.
      // We fail silently for optional servers.
    }
  }

  const provider = createLLM();

  const briefcase = new Briefcase(registry, provider, sopRegistry, mcp);
  const switchTool = createSwitchCompanyTool(briefcase);
  registry.tools.set(switchTool.name, switchTool as any);

  // Apply initial company context if env var is set or active in config
  let company = process.env.JULES_COMPANY;
  if (!company) {
    const config = await loadConfig();
    company = config.active_company;
  }

  if (company) {
    process.env.JULES_COMPANY = company;
    await briefcase.switchCompany(company);
  }

  const engine = new Engine(provider, registry, mcp);

  showBanner();

  const skill = await getActiveSkill(cwd);
  const ctx = new Context(cwd, skill);

  await engine.run(ctx, prompt || undefined, { interactive });
  outro("Session finished.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
