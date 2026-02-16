#!/usr/bin/env node
import "dotenv/config";
import { statSync } from "fs";
import { Engine, Context, Registry } from "./engine.js";
import { allBuiltins } from "./builtins.js";
import { createLLM } from "./llm.js";
import { MCP } from "./mcp.js";
import { getActiveSkill } from "./skills.js";
import { showBanner } from "./tui.js";
import { outro } from "@clack/prompts";

async function main() {
  const args = process.argv.slice(2);

  // Capture initial CWD before any chdir
  const initialCwd = process.cwd();

  // Handle optional directory argument
  let cwd = initialCwd;
  let interactive = true;
  const remainingArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

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

  const prompt = remainingArgs.filter((a) => !a.startsWith("-")).join(" ");

  const registry = new Registry();
  allBuiltins.forEach((t) => registry.tools.set(t.name, t as any));

  // 1. Load tools from Target Workspace (CWD) - The project being worked on
  await registry.loadProjectTools(cwd);

  // 2. Load tools from Runtime Location (Initial CWD) - The agent's own skills
  if (initialCwd !== cwd) {
    // If we are running from outside the project dir
    await registry.loadProjectTools(initialCwd);
  }

  // 3. Robust fallback: Load relative to script location
  // This handles cases where initialCwd is unpredictable (like in global installs)
  try {
    const { dirname, resolve } = await import("path");
    const { fileURLToPath } = await import("url");
    const scriptDir = dirname(fileURLToPath(import.meta.url)); // src/
    const projectRoot = resolve(scriptDir, ".."); // .

    if (projectRoot !== cwd && projectRoot !== initialCwd) {
      await registry.loadProjectTools(projectRoot);
    }
  } catch (e) {
    // Ignore
  }

  const mcp = new MCP();
  const provider = createLLM();
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
