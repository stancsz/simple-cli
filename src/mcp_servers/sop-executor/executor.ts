import { SOPParser } from "./parser.js";
import { SopExecutorClient } from "./client.js";
import { SOP, SOPProgress, StepLog } from "./types.js";
import { createLLM, LLM } from "../../llm.js";
import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

export class SOPExecutor {
    private parser: SOPParser;
    private client: SopExecutorClient;
    private llm: LLM;
    private progressDir: string;
    private sopsDir: string;

    constructor() {
        this.parser = new SOPParser();
        this.client = new SopExecutorClient();
        this.llm = createLLM();
        this.progressDir = join(process.cwd(), ".agent");
        this.sopsDir = join(process.cwd(), ".agent", "sops");
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

    async executeStep(sopName: string): Promise<any> {
        const sop = await this.loadSOP(sopName);
        const progressMap = this.loadProgress();

        // Normalize key to sop.name (from parser, matches filename base)
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

        const stepIndex = progress.current_step_index;
        if (stepIndex >= sop.steps.length) {
            progress.status = "completed";
            this.saveProgress({ ...progressMap, [key]: progress });
            return { status: "completed", message: "All steps finished.", history: progress.history };
        }

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

## Decision Logic (Smart Router)
Analyze the instruction and choose the best tool:
- **Filesystem**: For reading/writing files, creating directories.
- **Git**: For version control (commit, push, pull, checkout).
- **CrewAI**: For internet research, competitor analysis, or complex multi-step reasoning tasks.
- **Claude**: For complex code refactoring, architecture, or deep reasoning.
- **Aider**: For simple code edits, typos, or single-file changes.
- **Dify Supervisor**: For planning complex tasks locally or with privacy constraints.
- **Dify Coding**: For executing coding tasks locally.
- **Brain**: To store/retrieve memories if explicitly asked.
- **Wait**: If human intervention is clearly required and no tool exists (e.g., "Wait for approval"), return "tool": "none" with a message.

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
                // Check if tool exists
                if (!toolNames.includes(response.tool)) {
                    throw new Error(`LLM selected unavailable tool: ${response.tool}`);
                }

                const output = await this.client.executeTool(response.tool, response.args);
                stepLog.output = output;

                if (output && output.isError) {
                     throw new Error(`Tool execution failed: ${JSON.stringify(output.content)}`);
                }

                progress.current_step_index++;
            } else {
                stepLog.status = "skipped";
                stepLog.output = response.message || "No tool selected";
                progress.current_step_index++;
            }

        } catch (e: any) {
            stepLog.status = "failure";
            stepLog.error = e.message;
            progress.status = "failed";
        }

        progress.history.push(stepLog);
        this.saveProgress({ ...progressMap, [key]: progress });

        return stepLog;
    }

    async run(sopName: string): Promise<any> {
        // Load SOP to get the key
        const sop = await this.loadSOP(sopName);
        const key = sop.name;

        let result;
        while (true) {
            result = await this.executeStep(sopName); // executeStep handles loading progress

            // Check status from progress map to be sure
            const progress = this.loadProgress()[key];
            if (progress && (progress.status === "completed" || progress.status === "failed")) {
                result = progress;
                break;
            }
        }
        return result;
    }
}
