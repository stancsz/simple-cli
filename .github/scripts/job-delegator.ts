import "dotenv/config";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { createLLM } from "../../src/llm.js";
import { JulesClient } from "./jules-utils.js";
import chalk from "chalk";

async function main() {
    console.log(chalk.blue.bold("🤖 Smart Job Delegator: Initializing..."));

    const roadmapPath = path.resolve(process.cwd(), "docs/ROADMAP.md");
    const specsPath = path.resolve(process.cwd(), "docs/specs.md");
    const todoPath = path.resolve(process.cwd(), "docs/todo.md");

    const roadmap = fs.existsSync(roadmapPath) ? fs.readFileSync(roadmapPath, "utf-8") : "";
    const specs = fs.existsSync(specsPath) ? fs.readFileSync(specsPath, "utf-8") : "";
    const todo = fs.existsSync(todoPath) ? fs.readFileSync(todoPath, "utf-8") : "";

    console.log(chalk.cyan("🔍 Fetching open Pull Requests..."));
    let prsJson = "";
    try {
        prsJson = execSync("gh pr list --json number,title,author,headRefName --state open", { encoding: "utf-8" });
    } catch (e) {
        console.warn(chalk.yellow("⚠️ Failed to fetch PRs using gh CLI. Proceeding without PR context."));
    }
    const prs = prsJson ? JSON.parse(prsJson) : [];

    // Ensure we use the correct model format if provided in env
    const modelStr = process.env.MODEL || "deepseek:deepseek-reasoner";
    console.log(chalk.gray(`[Config] Using model string: ${modelStr}`));
    const llm = createLLM(modelStr);
    console.log(chalk.gray(`[Env Check] DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? "Present" : "Missing"}`));
    console.log(chalk.gray(`[Env Check] ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "Present" : "Missing"}`));

    const systemPrompt = `You are the "Principal Architect & Manager" for the Simple CLI project.
Your mission is to orchestrate the evolution of the project from a CLI tool into a true "Digital Agency" of autonomous coworkers.

### STRATEGIC CONTEXT:
1. **ROADMAP**:
${roadmap}

2. **TECHNICAL SPECS**:
${specs}

3. **CURRENT PROGRESS (TODOs)**:
${todo}

4. **ACTIVE WORK (Open PRs)**:
${JSON.stringify(prs)}

### YOUR OBJECTIVE:
Analyze the roadmap against current progress and identify the absolute next steps required to achieve the "4-Pillar Vision" (Company Context, SOP-as-Code, Ghost Mode, Recursive Optimization).

### RULES:
1. **DEEP DOCUMENTATION AUDIT**: You MUST read the Roadmap and Specs first. Understand "Phase 5" and the "4 Pillars".
2. **NO DUPLICATION**: Check open PRs. If a task is mentioned in a PR title or description, skip it or find an independent sub-task.
3. **HIGH-DETAIL DELEGATION**: Jules is a senior AI engineer but performs best with high-context instructions. Your task descriptions should include:
    - **Goal**: What exactly should be achieved.
    - **Files to touch/create**: Suggest paths based on the project structure.
    - **Logic**: Briefly explain the architectural approach (e.g., "Implement as an MCP server in src/mcp_servers/...").
    - **Constraints**: Mention existing patterns (e.g., "Use the LLM class from src/llm.ts").
4. **INDEPENDENCE**: Suggest tasks that can be worked on concurrently if possible. Limit your response to a MAXIMUM of 3 high-priority tasks per run.

### OUTPUT FORMAT (JSON ONLY):
{
  "thought": "A detailed analysis of what is missing based on the roadmap vs current state.",
  "tasks": [
    {
      "description": "A comprehensive, 2-3 paragraph instruction for Jules, including specific file paths and technical requirements.",
      "priority": "high/medium/low"
    }
  ],
  "should_delegate": true
}`;

    console.log(chalk.cyan("🧠 Reasoning about the next steps using " + modelStr + "..."));
    const response = await llm.generate(systemPrompt, [{ role: "user", content: "What are the next tasks we should work on?" }]);

    let decision;
    try {
        const jsonMatch = response.raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON block found in LLM response");

        const cleanJson = jsonMatch[0];
        try {
            decision = JSON.parse(cleanJson);
        } catch {
            const { jsonrepair } = await import("jsonrepair");
            decision = JSON.parse(jsonrepair(cleanJson));
        }
    } catch (e: any) {
        console.error(chalk.red("❌ Failed to parse LLM decision:"), e.message);
        console.log(chalk.gray("Raw Output:"), response.raw);
        process.exit(1);
    }

    console.log(chalk.green.bold("\n--- Decision ---"));
    console.log(chalk.white("Rationale:"), decision.thought);

    if (decision.should_delegate && decision.tasks && decision.tasks.length > 0) {
        const jules = new JulesClient();

        // Limit to 1 task per run to avoid overwhelming the system
        const tasksToDelegate = decision.tasks.slice(0, 1);

        for (const taskObj of tasksToDelegate) {
            console.log(chalk.white("\nNext Task:"), chalk.yellow(taskObj.description));
            console.log(chalk.cyan("📤 Delegating to Jules..."));

            const result = await jules.delegateTask(taskObj.description);

            if (result.success) {
                console.log(chalk.green.bold("✅ Success:"), result.message);
            } else {
                console.error(chalk.red("❌ Failed:"), result.message);
            }
        }
    } else {
        console.log(chalk.yellow("⏸️ Decision: No new tasks to delegate at this time."));
    }
}

main().catch((err) => {
    console.error(chalk.red("Fatal Error:"), err);
    process.exit(1);
});
