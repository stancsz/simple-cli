import { SOP, SOPStep } from "./types.js";
import { readFile } from "fs/promises";
import { parse } from "yaml";
import { basename } from "path";

export class SOPParser {
  async parse(filepath: string): Promise<SOP> {
    const content = await readFile(filepath, "utf-8");
    const sop = this.parseContent(content);
    sop.name = basename(filepath, ".md");
    return sop;
  }

  private parseContent(content: string): SOP {
    const lines = content.split('\n');
    let goal = "";
    let prerequisites: string[] = [];
    const steps: SOPStep[] = [];
    let currentSection: "none" | "goal" | "prerequisites" | "steps" = "none";

    // 1. Check YAML Frontmatter for backward compatibility
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);
    if (match) {
        try {
            const yamlContent = match[1];
            const parsed = parse(yamlContent);
            if (parsed.steps && Array.isArray(parsed.steps)) {
                 // Convert old format to new
                 return {
                    name: parsed.name || "Legacy SOP",
                    goal: parsed.description || "Legacy SOP",
                    prerequisites: [],
                    steps: parsed.steps.map((s: any, i: number) => ({
                        name: s.name || `Step ${i + 1}`,
                        instruction: s.description || s.name || `Execute ${s.tool || 'unknown tool'}`
                    }))
                 };
            }
        } catch (e) {
            console.warn(`Error parsing YAML frontmatter: ${e}`);
        }
    }

    // 2. Parse Markdown Body
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (line.match(/^##\s*Goal/i)) {
            currentSection = "goal";
            continue;
        } else if (line.match(/^##\s*Prerequisites/i)) {
            currentSection = "prerequisites";
            continue;
        } else if (line.match(/^##\s*Steps/i)) {
            currentSection = "steps";
            continue;
        } else if (line.startsWith("#")) {
            // Keep goal/prerequisites/steps section active unless another H1/H2 overrides specifically?
            // Usually ## implies new section.
            if (line.startsWith("##")) currentSection = "none";
            continue;
        }

        if (currentSection === "goal") {
            goal += (goal ? "\n" : "") + line;
        } else if (currentSection === "prerequisites") {
            // - Prereq
            const match = line.match(/^-\s*(.*)$/);
            if (match) {
                prerequisites.push(match[1].trim());
            }
        } else if (currentSection === "steps") {
            // 1. Step
            const match = line.match(/^\d+\.\s*(.*)$/);
            if (match) {
                steps.push({
                    name: `Step ${steps.length + 1}`,
                    instruction: match[1].trim()
                });
            }
        }
    }

    return {
        name: "SOP",
        goal: goal.trim(),
        prerequisites,
        steps
    };
  }
}
