import "dotenv/config";
import { createLLM } from "../llm.js";
import { MCP } from "../mcp.js";
import { Registry, Context } from "../engine/orchestrator.js";
import { AutonomousOrchestrator } from "../engine/autonomous.js";
import { getActiveSkill } from "../skills.js";
import { TaskDefinition } from "./task_definitions.js";
import { join, dirname } from "path";
import { existsSync } from "fs";
import { readFile, writeFile, mkdir } from "fs/promises";

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

  const cwd = process.cwd();

  const registry = new Registry();

  const mcp = new MCP();
  const provider = createLLM();

  const orchestrator = new AutonomousOrchestrator(provider, registry, mcp, {
    logPath: join(cwd, '.agent', 'autonomous.log'),
    yoloMode: taskDef.yoloMode ?? true
  });

  const skill = await getActiveSkill(cwd);

  // Load and inject Agent Soul if exists
  const soulPath = join(cwd, "src", "agents", "souls", `${taskDef.name}.md`);
  if (existsSync(soulPath)) {
      try {
          const soulContent = await readFile(soulPath, "utf-8");
          skill.systemPrompt += `\n\n## Agent Instructions (Soul)\n${soulContent}`;
          console.log(`Loaded soul for agent: ${taskDef.name}`);
      } catch (e) {
          console.error(`Failed to load soul for agent ${taskDef.name}:`, e);
      }
  }

  const ctx = new Context(cwd, skill);

  console.log(`Starting task: ${taskDef.name} (ID: ${taskDef.id})`);
  const startTime = Date.now();
  let status = "success";
  let errorMessage = "";

  try {
    // Run autonomously
    await orchestrator.run(ctx, taskDef.prompt, { interactive: false });
    console.log(`Task ${taskDef.name} completed successfully.`);
  } catch (e: any) {
    console.error(`Task ${taskDef.name} failed:`, e);
    status = "failed";
    errorMessage = e.message;
  } finally {
     // Save execution result
     try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const logPath = join(cwd, '.agent/logs', `${timestamp}_${taskDef.id}.json`);
        await mkdir(dirname(logPath), { recursive: true });
        await writeFile(logPath, JSON.stringify({
            taskId: taskDef.id,
            taskName: taskDef.name,
            startTime,
            endTime: Date.now(),
            status,
            errorMessage,
            history: ctx.history
        }, null, 2));
        console.log(`Execution result saved to ${logPath}`);
     } catch (logErr) {
         console.error(`Failed to save execution result: ${logErr}`);
     }

     if (status === "failed") process.exit(1);
     process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
