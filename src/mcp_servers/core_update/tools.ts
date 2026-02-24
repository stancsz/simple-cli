import { z } from "zod";
import { readFile, writeFile, mkdir, copyFile } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";
import { createPatch, applyPatch, createTwoFilesPatch } from "diff";
import { createLLM } from "../../llm.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { SafetyProtocol } from "./safety.js";
import { analyzeCodeSmellPrompt, proposalPrompt } from "./prompts.js";

export const analyzeCodeSmellTool = {
  name: "analyze_code_smell",
  description: "Analyzes a source file for performance issues, bugs, and architectural debt.",
  parameters: {
    filePath: z.string().describe("Path to the file to analyze (relative to project root).")
  },
  execute: async ({ filePath }: { filePath: string }) => {
    try {
      const fullPath = join(process.cwd(), filePath);
      if (!existsSync(fullPath)) {
        return { content: [{ type: "text" as const, text: `Error: File not found at ${filePath}` }], isError: true };
      }

      const content = await readFile(fullPath, "utf-8");
      const llm = createLLM();
      const prompt = analyzeCodeSmellPrompt(filePath, content);
      const response = await llm.generate(prompt, []);

      return { content: [{ type: "text" as const, text: response.message || response.raw }] };
    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error analyzing file: ${e.message}` }], isError: true };
    }
  }
};

export const proposeCoreUpdateTool = {
  name: "propose_core_update",
  description: "Generates a detailed change proposal (diff) for a core file based on a description.",
  parameters: {
    filePath: z.string().describe("Path to the file to modify."),
    improvementDescription: z.string().describe("Detailed description of the desired improvement.")
  },
  execute: async ({ filePath, improvementDescription }: { filePath: string, improvementDescription: string }) => {
    try {
      const fullPath = join(process.cwd(), filePath);
      if (!existsSync(fullPath)) {
        return { content: [{ type: "text" as const, text: `Error: File not found at ${filePath}` }], isError: true };
      }

      const content = await readFile(fullPath, "utf-8");
      const llm = createLLM(); // Uses default model
      const prompt = proposalPrompt(filePath, content, improvementDescription);
      const response = await llm.generate(prompt, []);

      let proposal: any;
      try {
          const rawMsg = response.message || response.raw;
          const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
              proposal = JSON.parse(jsonMatch[0]);
          } else {
              throw new Error("Invalid JSON response from LLM");
          }
      } catch (e: any) {
          return { content: [{ type: "text" as const, text: `Error parsing proposal: ${e.message}\nRaw Output: ${response.message}` }], isError: true };
      }

      if (!proposal.revised_content) {
           return { content: [{ type: "text" as const, text: `Error: LLM did not return revised content.` }], isError: true };
      }

      // Compute Diff
      // createTwoFilesPatch(fileName, fileName, oldStr, newStr, oldHeader, newHeader, options)
      const patch = createTwoFilesPatch(filePath, filePath, content, proposal.revised_content, "Original", "Revised");

      const result = {
          diff: patch,
          rationale: proposal.rationale,
          test_plan: proposal.test_plan
      };

      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };

    } catch (e: any) {
      return { content: [{ type: "text" as const, text: `Error generating proposal: ${e.message}` }], isError: true };
    }
  }
};

export const applyCoreUpdateTool = {
  name: "apply_core_update",
  description: "Securely applies a core update after verification.",
  parameters: {
    filePath: z.string().describe("Path to the target file."),
    diff: z.string().describe("The unified diff to apply."),
    summary: z.string().describe("Summary of the change for the Supervisor."),
    yoloMode: z.boolean().optional().default(false).describe("If true, skips human approval (but not Supervisor verification)."),
    autoDecisionTimeout: z.number().optional().default(30000).describe("Timeout in ms for human approval.")
  },
  execute: async ({ filePath, diff, summary, yoloMode = false, autoDecisionTimeout = 30000 }: { filePath: string, diff: string, summary: string, yoloMode?: boolean, autoDecisionTimeout?: number }) => {
    try {
      const fullPath = join(process.cwd(), filePath);
      if (!existsSync(fullPath)) {
        return { content: [{ type: "text" as const, text: `Error: File not found at ${filePath}` }], isError: true };
      }

      const content = await readFile(fullPath, "utf-8");

      // 1. Verify
      const safety = new SafetyProtocol();
      await safety.verify(filePath, diff, summary, yoloMode, autoDecisionTimeout);

      // 2. Backup
      const backupsDir = join(process.cwd(), ".agent", "backups");
      if (!existsSync(backupsDir)) {
          await mkdir(backupsDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = join(backupsDir, `${basename(filePath)}_${timestamp}.bak`);
      await copyFile(fullPath, backupPath);

      // 3. Apply Patch
      const newContent = applyPatch(content, diff);
      if (!newContent && newContent !== "") {
          // applyPatch returns string on success, or false (boolean) on failure.
          // Wait, check return type of applyPatch. It returns string or boolean false.
          // If newContent is empty string, it's valid.
           return { content: [{ type: "text" as const, text: `Error: Failed to apply patch. It might be stale or malformed.` }], isError: true };
      }

      if (newContent === false) {
           return { content: [{ type: "text" as const, text: `Error: Failed to apply patch. It might be stale or malformed.` }], isError: true };
      }

      // 4. Write File
      await writeFile(fullPath, newContent as string);

      // 5. Log to Memory
      const memory = new EpisodicMemory();
      await memory.init();
      await memory.store(
          `core_update_${timestamp}`,
          `Apply core update to ${filePath}`,
          `Successfully applied update.\nSummary: ${summary}\nBackup: ${backupPath}`,
          [backupPath]
      );

      return { content: [{ type: "text" as const, text: `Successfully applied update to ${filePath}.\nBackup created at: ${backupPath}` }] };

    } catch (e: any) {
      // Log failure
      const memory = new EpisodicMemory();
      await memory.init();
      await memory.store(
          `core_update_failed_${Date.now()}`,
          `Apply core update to ${filePath}`,
          `FAILED: ${e.message}`,
          []
      );
      return { content: [{ type: "text" as const, text: `Error applying update: ${e.message}` }], isError: true };
    }
  }
};
