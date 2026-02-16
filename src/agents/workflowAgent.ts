import { SopMcpClient } from "../sop/SopMcpClient.js";
import { createLLM, LLM } from "../llm.js";
import { SOPStep } from "../sop/sop_parser.js";
import { appendFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

export class WorkflowAgent {
  private llm: LLM;
  private client: SopMcpClient;

  constructor(client: SopMcpClient) {
    this.client = client;
    this.llm = createLLM();
  }

  async executeStep(step: SOPStep, context: Record<string, any>): Promise<any> {
    const stepDescription = step.description || step.name;
    const interpolatedArgs = this.interpolate(step.args || {}, context);

    await this.logStep(step.name, "start", { description: stepDescription, args: interpolatedArgs });

    try {
      let output: any;

      if (step.tool) {
        if (step.tool === 'llm' || step.tool === 'ask_llm') {
          // Use LLM directly
          const prompt = interpolatedArgs.prompt || stepDescription || "No prompt provided.";
          const response = await this.llm.generate(
            `You are executing a step in an SOP. Step: '${step.name}' - '${stepDescription}'. Context: ${JSON.stringify(context)}`,
            [{ role: 'user', content: prompt }]
          );
          output = response.message;
        } else {
          // Use specified tool via Client
          output = await this.client.executeTool(step.tool, interpolatedArgs);

          if (output && output.content && Array.isArray(output.content)) {
            const textContent = output.content.find((c: any) => c.type === 'text')?.text;
            if (textContent) {
                try {
                    // Try to parse JSON output if it looks like JSON
                    if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
                        output = JSON.parse(textContent);
                    } else {
                        output = textContent;
                    }
                } catch {
                    output = textContent;
                }
            }
          }
        }
      } else {
        // No tool specified -> Agent logic
        const tools = this.client.getToolNames();
        const prompt = `
You are an autonomous Workflow Agent executing a step in a Standard Operating Procedure.
Step: "${step.name}"
Description: "${stepDescription}"

Available Tools: ${tools.join(", ")}

Context: ${JSON.stringify(context, null, 2)}

Your task is to execute this step using the available tools if necessary, or provide a text response if no tool is needed.
If you need to use a tool, respond with a tool call in JSON format: {"tool": "tool_name", "args": {...}}.
If you can answer directly or the step is just informational/reasoning, provide the answer in the "message" field.
`;

        const response = await this.llm.generate(
            "You are a helpful workflow agent.",
            [{ role: 'user', content: prompt }]
        );

        if (response.tool && response.tool !== 'none') {
            const toolName = response.tool;
            const toolArgs = response.args || {};

            await this.logStep(step.name, "tool_call", { tool: toolName, args: toolArgs });

            try {
                const toolOutput = await this.client.executeTool(toolName, toolArgs);
                output = toolOutput; // Return tool output directly? Or wrap it?

                // Maybe the agent needs to interpret the output?
                // For now, let's return the raw output as the step result.
                if (toolOutput && toolOutput.content && Array.isArray(toolOutput.content)) {
                    const textContent = toolOutput.content.find((c: any) => c.type === 'text')?.text;
                    if (textContent) {
                         try {
                            if (textContent.trim().startsWith('{') || textContent.trim().startsWith('[')) {
                                output = JSON.parse(textContent);
                            } else {
                                output = textContent;
                            }
                        } catch {
                            output = textContent;
                        }
                    }
                }

            } catch (e: any) {
                throw new Error(`Agent-initiated tool '${toolName}' failed: ${e.message}`);
            }
        } else {
            output = response.message;
        }
      }

      await this.logStep(step.name, "complete", { output });
      return output;

    } catch (e: any) {
      await this.logStep(step.name, "error", { error: e.message });
      throw e;
    }
  }

  private interpolate(template: any, context: Record<string, any>): any {
      if (typeof template === "string") {
        const exactMatch = template.match(/^\{\{\s*([^{}]+)\s*\}\}$/);
        if (exactMatch) {
          const key = exactMatch[1].trim();
          const value = this.resolvePath(context, key);
          return value !== undefined ? value : template;
        }
        return template.replace(/\{\{\s*([^{}]+)\s*\}\}/g, (_, key) => {
          const value = this.resolvePath(context, key.trim());
          return value !== undefined ? String(value) : `{{${key}}}`;
        });
      } else if (Array.isArray(template)) {
        return template.map((item) => this.interpolate(item, context));
      } else if (typeof template === "object" && template !== null) {
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(template)) {
          result[k] = this.interpolate(v, context);
        }
        return result;
      }
      return template;
  }

  private resolvePath(obj: any, path: string): any {
    return path.split(".").reduce((o, p) => (o ? o[p] : undefined), obj);
  }

  private async logStep(stepName: string, event: string, data: any) {
    const logsDir = join(process.cwd(), ".agent", "sop_logs");
    if (!existsSync(logsDir)) {
      await mkdir(logsDir, { recursive: true });
    }

    // Log to a file named after the timestamp or session (maybe passed in context?)
    // For simplicity, let's append to a daily log file or similar.
    // Or maybe separate by SOP run ID if provided.
    const logFile = join(logsDir, `workflow_agent.jsonl`);

    const entry = {
      timestamp: new Date().toISOString(),
      step: stepName,
      event,
      data
    };

    await appendFile(logFile, JSON.stringify(entry) + "\n");
  }
}
