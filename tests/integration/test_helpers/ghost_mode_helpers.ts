
import { AutonomousOrchestrator } from "../../../src/engine/autonomous.js";
import { Registry, Context } from "../../../src/engine/orchestrator.js";
import { getActiveSkill } from "../../../src/skills.js";
import { join } from "path";
import { mkdir, writeFile } from "fs/promises";

export async function runTaskInProcess(task: any, mcp: any, llm: any) {
    const cwd = process.cwd();
    const registry = new Registry();

    // In real app, tools are loaded via MCP discovery.
    // Here, we rely on the mocked MCP to provide tools via getTools().
    // The Engine calls mcp.getTools() and populates registry.

    const orchestrator = new AutonomousOrchestrator(llm, registry, mcp, {
        logPath: join(cwd, '.agent', 'autonomous.log'),
        yoloMode: task.yoloMode ?? true
    });

    const skill = await getActiveSkill(cwd);
    const ctx = new Context(cwd, skill);

    console.log(`[TestHelper] Running task: ${task.name}`);

    try {
        await orchestrator.run(ctx, task.prompt, { interactive: false });
        console.log(`[TestHelper] Task ${task.name} completed.`);
    } catch (e: any) {
        console.error(`[TestHelper] Task ${task.name} failed:`, e);
        throw e;
    }
}
