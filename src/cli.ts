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
  const coreServers = ["filesystem", "git", "context_server", "company_context", "aider-server", "claude-server"];
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

  // Apply initial company context if env var is set
  if (process.env.JULES_COMPANY) {
    await briefcase.switchCompany(process.env.JULES_COMPANY);
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
