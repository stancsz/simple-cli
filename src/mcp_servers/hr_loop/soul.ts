import { readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { createLLM } from "../../llm.js";
import { updateSoulPrompt } from "../../hr/prompts.js";

const SOULS_DIR = join(process.cwd(), "src", "agents", "souls");

export async function updateSoul(
  agentName: string,
  newInstructions: string,
  yoloMode: boolean = false,
  analysis: string = "Manual update request."
): Promise<string> {
  if (!existsSync(SOULS_DIR)) {
    await mkdir(SOULS_DIR, { recursive: true });
  }

  const soulPath = join(SOULS_DIR, `${agentName}.md`);
  let currentSoul = "";

  if (existsSync(soulPath)) {
    currentSoul = await readFile(soulPath, "utf-8");
  } else {
    currentSoul = `# ${agentName} Soul\n\nNo previous instructions.`;
  }

  // Generate new soul using LLM
  const llm = createLLM();
  const prompt = updateSoulPrompt(agentName, currentSoul, analysis, newInstructions);

  // Add a dummy user message because some LLM providers fail with empty messages
  const response = await llm.generate(prompt, [{ role: "user", content: "Please generate the new soul content based on the instructions above." }]);
  let newSoulContent = response.message || response.raw;

  if (!newSoulContent || newSoulContent.length < 10) {
      throw new Error(`Failed to generate valid soul content. Content too short.`);
  }

  // Remove markdown code blocks if present
  newSoulContent = newSoulContent.replace(/^```markdown\n/, "").replace(/^```\n/, "").replace(/\n```$/, "");

  if (yoloMode) {
      // Create backup
      if (existsSync(soulPath)) {
          const backupPath = `${soulPath}.bak`;
          await writeFile(backupPath, currentSoul);
      }

      // Write new content
      await writeFile(soulPath, newSoulContent);
      return `Successfully updated soul for ${agentName}. Backup created at ${soulPath}.bak`;
  } else {
      // Write to proposed file
      const proposedPath = `${soulPath}.proposed`;
      await writeFile(proposedPath, newSoulContent);
      return `Proposed changes for ${agentName} written to ${proposedPath}. Please review and call update_agent_soul with yoloMode=true to apply.`;
  }
}
