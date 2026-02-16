import "dotenv/config";
import { TaskRunner } from "./task_runner.js";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { Registry, Context } from "../engine.js";
import { getActiveSkill } from "../skills.js";
import { TaskDefinition } from "./task_definitions.js";
import { allBuiltins } from "../builtins.js";

async function main() {
  const taskDefStr = process.env.JULES_TASK_DEF;
  if (!taskDefStr) {
    console.error("No task definition provided (JULES_TASK_DEF).");
    process.exit(1);
  }

  let taskDef: TaskDefinition;
  try {
    taskDef = JSON.parse(taskDefStr);
  } catch (e) {
    console.error("Failed to parse JULES_TASK_DEF:", e);
    process.exit(1);
  }

  const cwd = process.cwd(); // Should be set by daemon to project root

  // Company context is handled by process.env.JULES_COMPANY which should be set by daemon if applicable

  const registry = new Registry();
  allBuiltins.forEach((t) => registry.tools.set(t.name, t as any));

  await registry.loadProjectTools(cwd);

  const mcp = new MCP();
  const provider = createLLM();

  const runner = new TaskRunner(provider, registry, mcp, {
    yoloMode: taskDef.yoloMode ?? true,
    timeout: taskDef.autoDecisionTimeout
  });

  const skill = await getActiveSkill(cwd);
  const ctx = new Context(cwd, skill);

  console.log(`Starting task: ${taskDef.name} (ID: ${taskDef.id})`);

  try {
    await runner.run(ctx, taskDef.prompt);
    console.log(`Task ${taskDef.name} completed successfully.`);
    process.exit(0);
  } catch (e: any) {
    console.error(`Task ${taskDef.name} failed:`, e);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
