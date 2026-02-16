import { join } from "path";
import { existsSync } from "fs";
import { SOPParser, SOP } from "./sop_parser.js";
import { SopMcpClient } from "./SopMcpClient.js";
import { createLLM, LLM } from "../llm.js";
import { ContextManager } from "../mcp_servers/context_manager/index.js";

export interface ExecutionLog {
  step: string;
  status: "success" | "failure" | "skipped";
  output?: any;
  error?: string;
  timestamp: string;
}

export interface ExecutionResult {
  success: boolean;
  output?: any;
  error?: string;
  logs: ExecutionLog[];
}

export class SOPEngine {
  private parser: SOPParser;
  private client: SopMcpClient;
  private sopsDir: string;
  private llm: LLM;
  private contextManager: ContextManager;

  constructor(client: SopMcpClient, sopsDir: string = join(process.cwd(), ".agent", "sops")) {
    this.client = client;
    this.parser = new SOPParser();
    this.sopsDir = sopsDir;
    this.llm = createLLM();
    this.contextManager = new ContextManager();
  }

  async loadSOP(name: string): Promise<SOP> {
    const filepath = join(this.sopsDir, name.endsWith(".md") ? name : `${name}.md`);
    if (!existsSync(filepath)) {
      throw new Error(`SOP '${name}' not found at ${filepath}`);
    }
    return await this.parser.parse(filepath);
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

  private evaluateCondition(condition: string, context: Record<string, any>): boolean {
    const interpolated = this.interpolate(condition, context);
    if (typeof interpolated === 'boolean') return interpolated;
    if (interpolated === "true") return true;
    if (interpolated === "false") return false;

    if (typeof interpolated === 'string') {
      const eqMatch = interpolated.match(/^(.*?)\s*==\s*(.*)$/);
      if (eqMatch) {
        const left = eqMatch[1].trim().replace(/^['"]|['"]$/g, "");
        const right = eqMatch[2].trim().replace(/^['"]|['"]$/g, "");
        return left === right;
      }
    }
    return !!interpolated;
  }

  private validateStep(stepName: string, output: any): boolean {
    if (output === null || output === undefined) return false;
    // Basic check for error strings
    if (typeof output === 'string') {
      if (output.toLowerCase().startsWith("error:")) return false;
    }
    return true;
  }

  async executeSOP(name: string, params: Record<string, any> = {}): Promise<ExecutionResult> {
    let sop: SOP;
    try {
      sop = await this.loadSOP(name);
    } catch (e: any) {
      return { success: false, error: e.message, logs: [] };
    }

    // Log start to ContextManager
    await this.contextManager.logChange(`Started execution of SOP '${sop.name}'`);

    const context: Record<string, any> = {
      params,
      steps: {},
    };
    const logs: ExecutionLog[] = [];

    console.error(`[SOPEngine] Starting SOP '${sop.name}' with ${sop.steps.length} steps.`);

    for (const step of sop.steps) {
      console.error(`[SOPEngine] Executing Step: ${step.name}`);

      if (step.condition) {
        if (!this.evaluateCondition(step.condition, context)) {
          console.error(`[SOPEngine] Step skipped (condition false): ${step.condition}`);
          logs.push({
            step: step.name,
            status: "skipped",
            timestamp: new Date().toISOString()
          });
          continue;
        }
      }

      if (step.tool) {
        const args = step.args || {};
        const interpolatedArgs = this.interpolate(args, context);

        try {
          let output: any;

          if (step.tool === 'llm' || step.tool === 'ask_llm') {
            // Use LLM
            const prompt = interpolatedArgs.prompt || step.description || "No prompt provided.";
            // We treat 'system' as generic context here
            const response = await this.llm.generate(
              `You are executing a step in an SOP named '${sop.name}'. Step description: ${step.description}`,
              [{ role: 'user', content: prompt }]
            );
            output = response.message;
          } else {
            // Use Standard Tool via Client
            const result = await this.client.executeTool(step.tool, interpolatedArgs);

            if (result.isError) {
              throw new Error(`Tool execution returned error: ${JSON.stringify(result.content)}`);
            }

            output = result;
            if (result && result.content && Array.isArray(result.content)) {
              const textContent = result.content.find((c: any) => c.type === 'text')?.text;
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
          }

          // Validate
          if (!this.validateStep(step.name, output)) {
            throw new Error(`Validation failed for step '${step.name}'. Output indicates error.`);
          }

          context.steps[step.name] = output;
          logs.push({
            step: step.name,
            status: "success",
            output: output,
            timestamp: new Date().toISOString()
          });

        } catch (e: any) {
          console.error(`[SOPEngine] Step execution failed: ${e.message}`);

          // Log failure to ContextManager
          await this.contextManager.logChange(`SOP '${sop.name}' failed at step '${step.name}': ${e.message}`);

          // ROLLBACK LOGIC
          if (step.rollback) {
            try {
              console.log(`[SOPEngine] Initiating Rollback for step '${step.name}'...`);
              const rollbackArgs = this.interpolate(step.rollback.args || {}, context);

              // Rollback tool execution logic
              if (step.rollback.tool === 'llm' || step.rollback.tool === 'ask_llm') {
                const prompt = rollbackArgs.prompt || "Rollback execution.";
                await this.llm.generate(
                  `You are executing a rollback step for '${step.name}'. Description: ${step.description}`,
                  [{ role: 'user', content: prompt }]
                );
              } else {
                await this.client.executeTool(step.rollback.tool, rollbackArgs);
              }

              console.log(`[SOPEngine] Rollback executed successfully.`);
              await this.contextManager.logChange(`Rollback executed for step '${step.name}'`);
            } catch (re: any) {
              console.error(`[SOPEngine] Rollback failed: ${re.message}`);
              await this.contextManager.logChange(`Rollback failed for step '${step.name}': ${re.message}`);
            }
          }

          logs.push({
            step: step.name,
            status: "failure",
            error: e.message,
            timestamp: new Date().toISOString()
          });

          return { success: false, error: `Step '${step.name}' failed: ${e.message}`, logs };
        }
      } else {
        console.error(`[SOPEngine] Info Step: ${step.description}`);
        logs.push({
          step: step.name,
          status: "success",
          output: "Info step completed",
          timestamp: new Date().toISOString()
        });
      }
    }

    // Log success to ContextManager
    await this.contextManager.logChange(`Completed execution of SOP '${sop.name}' successfully.`);

    return {
      success: true,
      output: context,
      logs
    };
  }
}
