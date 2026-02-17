import { SOPParser } from "./parser.js";
import { SopClient } from "./client.js";
import { SOP, SOPProgress, StepLog } from "./types.js";
import { createLLM, LLM } from "../../llm.js";
import { join, basename } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { readdir } from "fs/promises";

export class SOPEngine {
    private parser: SOPParser;
    private client: SopClient;
    private llm: LLM;
    private progressDir: string;
    private sopsDir: string;

    constructor() {
        this.parser = new SOPParser();
        this.client = new SopClient();
        this.llm = createLLM();
        this.progressDir = join(process.cwd(), ".agent", "sops"); // Keep progress in .agent
        this.sopsDir = join(process.cwd(), "sops"); // Root sops dir
        if (!existsSync(this.progressDir)) mkdirSync(this.progressDir, { recursive: true });
        if (!existsSync(this.sopsDir)) mkdirSync(this.sopsDir, { recursive: true });
    }

    async init() {
        await this.client.init();
    }

    private getProgressPath(): string {
        return join(this.progressDir, "sop-progress.json");
    }

    private loadProgress(): Record<string, SOPProgress> {
        const path = this.getProgressPath();
        if (!existsSync(path)) return {};
        try {
            return JSON.parse(readFileSync(path, "utf-8"));
        } catch {
            return {};
        }
    }

    private saveProgress(progress: Record<string, SOPProgress>) {
        writeFileSync(this.getProgressPath(), JSON.stringify(progress, null, 2));
    }

    async listSOPs(): Promise<string[]> {
        if (!existsSync(this.sopsDir)) return [];
        const files = await readdir(this.sopsDir);
        return files.filter(f => f.endsWith(".md"));
    }

    async createSOP(topic: string, template?: string): Promise<string> {
        const prompt = `
You are an expert at creating Standard Operating Procedures (SOPs).
Create a detailed SOP for the following topic: "${topic}".
${template ? `Use this template/guidance: ${template}` : ""}

The output MUST be a valid Markdown file with the following structure:

## Goal
[A clear, concise goal of the SOP]

## Prerequisites
- [Prerequisite 1]
- [Prerequisite 2]

## Steps
1. [Step 1 Instruction]
2. [Step 2 Instruction]
...

Ensure the steps are actionable and clear.
Return ONLY the markdown content.
`;
        const response = await this.llm.generate(prompt, []);
        const content = response.message || response.raw || "";

        // Clean up markdown code blocks if present
        const cleanContent = content.replace(/^```markdown\n/, "").replace(/^```\n/, "").replace(/\n```$/, "");

        const filename = topic.toLowerCase().replace(/[^a-z0-9]+/g, "_") + ".md";
        const filepath = join(this.sopsDir, filename);

        writeFileSync(filepath, cleanContent);
        return filename;
    }

    async loadSOP(name: string): Promise<SOP> {
        let filepath = name;
        if (!name.endsWith(".md")) name += ".md";

        if (existsSync(name)) {
             filepath = name;
        } else {
             filepath = join(this.sopsDir, name);
        }

        if (!existsSync(filepath)) {
            // Try resolving as relative path from cwd
            const cwdPath = join(process.cwd(), name);
            if (existsSync(cwdPath)) {
                filepath = cwdPath;
            } else {
                throw new Error(`SOP not found: ${name}`);
            }
        }

        return await this.parser.parse(filepath);
    }

    async executeSOP(sopName: string): Promise<any> {
        const sop = await this.loadSOP(sopName);
        const progressMap = this.loadProgress();

        // Normalize key to sop.name (matches filename base usually)
        const key = sop.name;

        let progress = progressMap[key];
        if (!progress) {
            progress = {
                sop_name: key,
                current_step_index: 0,
                status: "pending",
                history: []
            };
        }

        if (progress.status === "completed") {
            return { status: "completed", message: "SOP already completed.", history: progress.history };
        }

        if (progress.status === "failed") {
             // Resume logic: reset to in_progress to retry the failed step
             progress.status = "in_progress";
        }

        // Loop through remaining steps
        while (progress.current_step_index < sop.steps.length) {
            const stepIndex = progress.current_step_index;
            const step = sop.steps[stepIndex];

            const stepLog: StepLog = {
                step_index: stepIndex,
                instruction: step.instruction,
                status: "success",
                timestamp: new Date().toISOString()
            };

            try {
                // Smart Router Logic
                const toolNames = this.client.getToolNames();
                const systemPrompt = `
You are an intelligent agent executing a Standard Operating Procedure (SOP).

## SOP Context
Name: ${sop.name}
Goal: ${sop.goal}

## Current Step (${stepIndex + 1}/${sop.steps.length})
Instruction: "${step.instruction}"

## Available Tools
${toolNames.join(", ")}

## Decision Logic
Analyze the instruction and choose the best tool.
- If the instruction is a direct tool call (e.g., "Use git to commit"), select the tool.
- If the instruction is natural language (e.g., "Research competitor X"), select a research tool (like 'crewai', 'gemini') or 'ask_claude' / 'aider' if appropriate.
- If the step requires human intervention (e.g. "Wait for approval"), use "tool": "none" and explain why.

## Output Format
Respond with a JSON object:
{
  "thought": "Brief reasoning for tool choice",
  "tool": "tool_name",
  "args": { ... }
}
If no tool is needed or possible, use "tool": "none".
`;

                const response = await this.llm.generate(systemPrompt, []);

                stepLog.tool = response.tool;
                stepLog.args = response.args;

                if (response.tool && response.tool !== "none") {
                    if (!toolNames.includes(response.tool)) {
                        throw new Error(`LLM selected unavailable tool: ${response.tool}`);
                    }

                    const output = await this.client.executeTool(response.tool, response.args);
                    stepLog.output = output;

                    if (output && output.isError) {
                         throw new Error(`Tool execution failed: ${JSON.stringify(output.content)}`);
                    }
                } else {
                    stepLog.status = "skipped";
                    stepLog.output = response.message || "No tool selected";
                }

                // Log to Brain if available
                if (toolNames.includes("brain_store_memory")) {
                    await this.client.executeTool("brain_store_memory", {
                        request: `SOP Step ${stepIndex + 1}: ${step.instruction}`,
                        solution: JSON.stringify(stepLog.output),
                        tags: ["sop", sop.name, "execution"]
                    }).catch(e => console.error("Failed to log to brain:", e)); // Non-blocking
                } else if (toolNames.includes("brain_store")) {
                     await this.client.executeTool("brain_store", {
                        taskId: `sop-${sop.name}-${stepIndex}`,
                        request: `SOP Step ${stepIndex + 1}: ${step.instruction}`,
                        solution: JSON.stringify(stepLog.output),
                        tags: ["sop", sop.name, "execution"]
                    }).catch(e => console.error("Failed to log to brain:", e));
                }

                progress.current_step_index++;
                progress.history.push(stepLog);
                this.saveProgress({ ...progressMap, [key]: progress });

            } catch (e: any) {
                stepLog.status = "failure";
                stepLog.error = e.message;
                progress.status = "failed";
                progress.history.push(stepLog);
                this.saveProgress({ ...progressMap, [key]: progress });
                throw e; // Stop execution
            }
        }

        progress.status = "completed";
        this.saveProgress({ ...progressMap, [key]: progress });
        return { status: "completed", message: "All steps finished.", history: progress.history };
    }
}
