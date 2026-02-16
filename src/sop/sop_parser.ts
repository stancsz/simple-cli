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
    return this.parseContent(content, filepath);
  }

  private parseContent(content: string, filepath: string): SOP {
    // 1. Try strict YAML Frontmatter first
    const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = content.match(frontmatterRegex);

    if (match) {
        try {
            const yamlContent = match[1];
            const parsed = parse(yamlContent);
            if (parsed.steps && Array.isArray(parsed.steps)) {
                 return {
                    name: parsed.name,
                    description: parsed.description,
                    steps: parsed.steps.map((step: any, index: number) => ({
                        name: step.name || `Step ${index + 1}`,
                        description: step.description,
                        tool: step.tool,
                        args: step.args || {},
                        rollback: step.rollback,
                        condition: step.condition
                    }))
                 };
            }
        } catch (e) {
            console.warn(`[SOPParser] Failed to parse YAML frontmatter in '${filepath}', falling back to body parsing: ${e}`);
        }
    }

    // 2. Fallback: Parse Markdown Body
    return this.parseMarkdownBody(content);
  }

  private parseMarkdownBody(content: string): SOP {
      const lines = content.split('\n');
      let name = "Untitled SOP";
      let description = "";
      const steps: SOPStep[] = [];

      let currentStep: SOPStep | null = null;

      const pushStep = () => {
          if (currentStep) {
              steps.push(currentStep);
              currentStep = null;
          }
      };

      for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const trimmed = line.trim();
          if (!trimmed) continue;

          // H1 Name
          if (trimmed.startsWith('# ')) {
              name = trimmed.substring(2).trim();
              continue;
          }

          // Step Detection: - [ ] Name, - Name, 1. Name
          const bulletMatch = line.match(/^\s*-\s*(?:\[\s*[xX ]?\s*\]\s*)?(.+)$/);
          const numberMatch = line.match(/^\s*\d+\.\s*(.+)$/);

          if (bulletMatch || numberMatch) {
              pushStep();
              const stepName = (bulletMatch ? bulletMatch[1] : numberMatch![1]).trim();
              currentStep = {
                  name: stepName,
                  args: {}
              };
              continue;
          }

          // Attribute Detection
          if (currentStep) {
              const attrMatch = line.match(/^\s*([a-zA-Z0-9_]+):\s*(.*)$/);
              if (attrMatch) {
                  const key = attrMatch[1].toLowerCase();
                  const value = attrMatch[2].trim();

                  if (key === 'tool') {
                      currentStep.tool = value;
                  } else if (key === 'description') {
                      currentStep.description = value;
                  } else if (key === 'condition') {
                      currentStep.condition = value;
                  } else if (key === 'args') {
                      if (value.startsWith('{')) {
                           let jsonStr = value;
                           // Multiline JSON handling
                           if (!value.endsWith('}')) {
                               let j = i + 1;
                               while (j < lines.length) {
                                   const nextLine = lines[j];
                                   // Heuristic break: next step or next attribute
                                   if (nextLine.match(/^\s*-\s/) || nextLine.match(/^\s*\d+\./) || (nextLine.match(/^\s*[a-zA-Z0-9_]+:/) && !nextLine.trim().startsWith('"'))) {
                                       break;
                                   }
                                   jsonStr += '\n' + nextLine;
                                   if (nextLine.trim() === '}') {
                                       j++; // Include closing brace line
                                       break;
                                   }
                                   j++;
                               }
                               i = j - 1; // Advance outer loop
                           }

                           try {
                               // Use JSON repair or just parse?
                               currentStep.args = JSON.parse(jsonStr);
                           } catch (e) {
                               console.warn(`Failed to parse args JSON for step '${currentStep.name}': ${e}`);
                           }
                      }
                  }
              }
          }
      }
      pushStep();

      return { name, description, steps };
  }
}
