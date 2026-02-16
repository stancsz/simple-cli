import { readFile } from "fs/promises";

export interface ToolCall {
  tool: string;
  args: Record<string, any>;
}

export interface SOPStep {
  name: string;
  description: string;
  tool_call?: ToolCall;
  condition?: string;
}

export interface SOP {
  name: string;
  steps: SOPStep[];
}

export class SOPParser {
  async parse(filepath: string): Promise<SOP> {
    const content = await readFile(filepath, "utf-8");
    const lines = content.split("\n");

    const steps: SOPStep[] = [];
    let currentStep: SOPStep | null = null;
    let sopName = "Untitled SOP";
    let currentStepIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      if (line.startsWith("# ")) {
        sopName = line.substring(2).trim();
        continue;
      }

      // Detect step (ordered or unordered list item)
      // e.g. "1. Step Name" or "- Step Name" or "- [ ] Step Name"
      const stepMatch = line.match(/^(\d+\.|-|\*)\s+(\[ \]\s+)?(.*)$/);
      const indent = rawLine.search(/\S|$/);

      // Heuristic: A new step should not be more indented than the previous one (assuming flat structure)
      // or at least it should be distinct from indented content.
      // For now, we assume top-level steps have low indentation (0-4 spaces).
      // If we are parsing args (which are indented), a line that looks like a step but is deeply indented
      // is likely content, not a new step.

      if (stepMatch && (currentStep === null || indent <= currentStepIndent)) {
        if (currentStep) {
          steps.push(currentStep);
        }
        currentStep = {
          name: stepMatch[3].trim(),
          description: "",
        };
        currentStepIndent = indent;
        continue;
      }

      if (currentStep) {
        // Parse metadata inside step
        if (line.startsWith("Tool:")) {
          const toolName = line.substring(5).trim();
          if (!currentStep.tool_call) {
            currentStep.tool_call = { tool: toolName, args: {} };
          } else {
            currentStep.tool_call.tool = toolName;
          }
        } else if (line.startsWith("Args:")) {
          const argsStart = line.substring(5).trim();
          let jsonStr = argsStart;

          // Check if it's potentially multiline JSON
          // If it starts with { or is empty (meaning JSON is on next lines)
          if (jsonStr === "" || jsonStr.startsWith("{")) {
               let j = i + 1;
               while (j < lines.length) {
                   const nextLine = lines[j];
                   const trimmedNext = nextLine.trim();

                   // Stop if we hit a new step or another keyword
                   if (trimmedNext.match(/^(\d+\.|-|\*)\s+/) ||
                       trimmedNext.startsWith("Tool:") ||
                       trimmedNext.startsWith("Condition:")) {
                     break;
                   }

                   jsonStr += "\n" + nextLine;
                   j++;
               }
               i = j - 1; // update outer loop to point to the last line consumed
          }

          try {
            // Remove potential markdown code block backticks if present
            const cleanJson = jsonStr.replace(/^```json\s*/, "").replace(/```$/, "").trim();

            const args = JSON.parse(cleanJson);
            if (!currentStep.tool_call) {
               // Assuming tool comes before args, but if not:
               currentStep.tool_call = { tool: "", args };
            } else {
               currentStep.tool_call.args = args;
            }
          } catch (e) {
            // console.error(`Failed to parse args for step '${currentStep.name}':`, e);
            currentStep.description += `\n(Failed to parse Args: ${jsonStr})`;
          }
        } else if (line.startsWith("Condition:")) {
            currentStep.condition = line.substring(10).trim();
        } else if (line.length > 0) {
          // Append to description if it's not a keyword
          currentStep.description += (currentStep.description ? "\n" : "") + line;
        }
      }
    }

    if (currentStep) {
      steps.push(currentStep);
    }

    return {
      name: sopName,
      steps,
    };
  }
}
