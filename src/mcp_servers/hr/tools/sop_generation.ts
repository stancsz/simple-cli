import { join, dirname } from "path";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { createLLM } from "../../../llm.js";
import { generateSOPPrompt } from "../prompts.js";

export const generateSOPFromPatterns = async (
  llm: ReturnType<typeof createLLM>,
  args: {
    pattern_analysis: string;
    title: string;
    filename?: string;
  }
) => {
  const { pattern_analysis, title, filename } = args;

  // Generate SOP content
  const prompt = generateSOPPrompt(pattern_analysis, title);
  const response = await llm.generate(prompt, []);
  let content = response.message || response.raw;

  // Clean up markdown blocks if present
  content = content.replace(/^```markdown\n/, "").replace(/^```\n/, "").replace(/\n```$/, "");

  // Determine filename
  const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  // If filename is not provided, use auto_generated pattern
  // If provided, assume it is relative to sops/
  let relativePath = filename;
  if (!relativePath) {
      relativePath = `auto_generated/sop_${safeTitle}_${Date.now()}.md`;
  }

  const sopsDir = join(process.cwd(), "sops");
  const filePath = join(sopsDir, relativePath);

  // Security check: Prevent path traversal
  if (!filePath.startsWith(sopsDir)) {
      throw new Error("Invalid filename: Path traversal detected.");
  }

  // Ensure directory exists
  const fileDir = dirname(filePath);
  if (!existsSync(fileDir)) {
      await mkdir(fileDir, { recursive: true });
  }

  // Write file
  await writeFile(filePath, content, "utf-8");

  return {
      content: [{ type: "text" as const, text: `SOP generated and saved to: ${filePath}\n\nContent Preview:\n${content.substring(0, 200)}...` }]
  };
};
