import { readFile } from "fs/promises";
import { parse } from "yaml";

export interface SOPStep {
  name: string;
  description?: string;
  tool?: string;
  args?: Record<string, any>;
  rollback?: { tool: string; args?: Record<string, any> };
  condition?: string;
}

export interface SOP {
  name: string;
  description?: string;
  steps: SOPStep[];
}

export class SOPParser {
  async parse(filepath: string): Promise<SOP> {
    const content = await readFile(filepath, "utf-8");

    // Extract frontmatter
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (!match) {
        throw new Error(`SOP file '${filepath}' is missing YAML frontmatter.`);
    }

    const yamlContent = match[1];
    const bodyContent = content.substring(match[0].length).trim();

    let parsed: any;
    try {
        parsed = parse(yamlContent);
    } catch (e: any) {
        throw new Error(`Failed to parse YAML frontmatter in '${filepath}': ${e.message}`);
    }

    if (!parsed.name || !Array.isArray(parsed.steps)) {
        throw new Error(`SOP frontmatter must contain 'name' and a 'steps' array.`);
    }

    const steps: SOPStep[] = parsed.steps.map((step: any, index: number) => ({
        name: step.name || `Step ${index + 1}`,
        description: step.description,
        tool: step.tool,
        args: step.args || {},
        rollback: step.rollback,
        condition: step.condition
    }));

    return {
        name: parsed.name,
        description: bodyContent || parsed.description,
        steps
    };
  }
}
