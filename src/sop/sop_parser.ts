import { readFile } from "fs/promises";
import { parse } from "yaml";

export interface SOPStep {
  name: string;
  type: 'tool' | 'if' | 'wait' | 'natural';
  description?: string;
  tool?: string;
  args?: Record<string, any>;
  condition?: string;
  then?: SOPStep;
  rollback?: { tool: string; args?: Record<string, any> };
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
                        type: step.type || (step.tool ? 'tool' : (step.condition ? 'if' : (step.wait ? 'wait' : 'natural'))),
                        description: step.description,
                        tool: step.tool,
                        args: step.args || {},
                        condition: step.condition,
                        then: step.then,
                        rollback: step.rollback
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

      let currentStep: Partial<SOPStep> | null = null;

      const pushStep = () => {
          if (currentStep) {
              // Finalize step type if not set
              if (!currentStep.type) {
                  if (currentStep.tool) currentStep.type = 'tool';
                  else if (currentStep.condition) currentStep.type = 'if';
                  else currentStep.type = 'natural';
              }
              // Default name if missing
              if (!currentStep.name) {
                  currentStep.name = `Step ${steps.length + 1}`;
              }
              steps.push(currentStep as SOPStep);
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
              const stepHeader = (bulletMatch ? bulletMatch[1] : numberMatch![1]).trim();

              currentStep = {
                  name: stepHeader,
                  args: {},
                  type: 'natural' // default
              };

              // Check if the header itself contains the instruction
              this.parseInstructionLine(stepHeader, currentStep);

              if (currentStep.type === 'natural') {
                  currentStep.description = stepHeader;
              }

              continue;
          }

          // Attribute/Instruction Detection
          if (currentStep) {
              // Check for explicit instructions
              if (this.parseInstructionLine(trimmed, currentStep)) {
                  continue;
              }

              // Legacy attribute parsing
              const attrMatch = line.match(/^\s*([a-zA-Z0-9_]+):\s*(.*)$/);
              if (attrMatch) {
                  const key = attrMatch[1].toLowerCase();
                  const value = attrMatch[2].trim();

                  if (key === 'tool') {
                      currentStep.tool = value;
                      currentStep.type = 'tool';
                  } else if (key === 'description') {
                      currentStep.description = value;
                  } else if (key === 'condition') {
                      currentStep.condition = value;
                      currentStep.type = 'if';
                  } else if (key === 'args') {
                      if (value.startsWith('{')) {
                           let jsonStr = value;
                           // Multiline JSON handling
                           if (!value.endsWith('}')) {
                               let j = i + 1;
                               while (j < lines.length) {
                                   const nextLine = lines[j];
                                   if (nextLine.match(/^\s*-\s/) || nextLine.match(/^\s*\d+\./) || (nextLine.match(/^\s*[a-zA-Z0-9_]+:/) && !nextLine.trim().startsWith('"'))) {
                                       break;
                                   }
                                   jsonStr += '\n' + nextLine;
                                   if (nextLine.trim() === '}') {
                                       j++;
                                       break;
                                   }
                                   j++;
                               }
                               i = j - 1;
                           }

                           try {
                               currentStep.args = JSON.parse(jsonStr);
                           } catch (e) {
                               // ignore
                           }
                      }
                  }
              }
          }
      }
      pushStep();

      return { name, description, steps };
  }

  private parseInstructionLine(line: string, step: Partial<SOPStep>): boolean {
      // TOOL: name [args]
      const toolMatch = line.match(/^TOOL:\s*([\w_-]+)\s*(.*)$/i);
      if (toolMatch) {
          step.type = 'tool';
          step.tool = toolMatch[1];
          const argsStr = toolMatch[2].trim();
          if (argsStr) {
              try {
                  step.args = JSON.parse(argsStr);
              } catch {
                  // Fallback: store as raw if needed, but 'args' expects Record
                  // If simple string, maybe wrap it?
                  // For now, ignore invalid JSON args or treat as empty
              }
          }
          return true;
      }

      // IF: condition THEN: instruction
      const ifMatch = line.match(/^IF:\s*(.+?)\s*THEN:\s*(.+)$/i);
      if (ifMatch) {
          step.type = 'if';
          step.condition = ifMatch[1].trim();
          const thenPart = ifMatch[2].trim();

          const thenStep: Partial<SOPStep> = { name: "Then Step" };
          this.parseInstructionLine(thenPart, thenStep);
          if (!thenStep.type) {
             thenStep.type = 'natural';
             thenStep.description = thenPart;
          }
          step.then = thenStep as SOPStep;
          return true;
      }

      // WAIT_FOR_HUMAN: description
      const waitMatch = line.match(/^WAIT_FOR_HUMAN:\s*(.+)$/i);
      if (waitMatch) {
          step.type = 'wait';
          step.description = waitMatch[1].trim();
          return true;
      }

      return false;
  }
}
