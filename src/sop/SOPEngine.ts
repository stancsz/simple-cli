import { join } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
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
  private workflowAgent: WorkflowAgent;

  constructor(client: SopMcpClient, sopsDir: string = join(process.cwd(), ".agent", "sops")) {
    this.client = client;
    this.parser = new SOPParser();
    this.sopsDir = sopsDir;
    this.llm = createLLM();
    this.contextManager = new ContextManager();
    this.workflowAgent = new WorkflowAgent(this.client);
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
      if (typeof output === 'string') {
          if (output.toLowerCase().startsWith("error:")) return false;
      }
      return true;
  }

  private getStatePath(sopName: string): string {
      const stateDir = join(process.cwd(), ".agent", "sop_states");
      if (!existsSync(stateDir)) {
          mkdirSync(stateDir, { recursive: true });
      }
      // Sanitize sopName
      const sanitized = sopName.replace(/[^a-zA-Z0-9]/g, "_");
      return join(stateDir, `${sanitized}.json`);
  }

  private saveState(sopName: string, stepIndex: number, context: any) {
      const path = this.getStatePath(sopName);
      writeFileSync(path, JSON.stringify({ stepIndex, context }));
  }

  private loadState(sopName: string): { stepIndex: number, context: any } | null {
      const path = this.getStatePath(sopName);
      if (existsSync(path)) {
          try {
              return JSON.parse(readFileSync(path, 'utf-8'));
          } catch (e) {
              console.error(`Failed to load state for ${sopName}: ${e}`);
          }
      }
      return null;
  }

  async executeSOP(name: string, params: Record<string, any> = {}, resume: boolean = false): Promise<ExecutionResult> {
    let sop: SOP;
    try {
        sop = await this.loadSOP(name);
    } catch (e: any) {
        return { success: false, error: e.message, logs: [] };
    }

    await this.contextManager.logChange(`Started execution of SOP '${sop.name}'`);

    let context: Record<string, any> = {
      params,
      steps: {},
    };
    let startStepIndex = 0;

    if (resume) {
        const state = this.loadState(name);
        if (state) {
            context = state.context;
            startStepIndex = state.stepIndex + 1;
            console.log(`[SOPEngine] Resuming SOP '${name}' from step index ${startStepIndex}`);
        } else {
            console.warn(`[SOPEngine] Resume requested but no state found for '${name}'. Starting from beginning.`);
        }
    } else {
        // If not resuming, maybe clear previous state?
        // Optional: unlink(this.getStatePath(name));
    }

    const logs: ExecutionLog[] = [];

    console.error(`[SOPEngine] Starting SOP '${sop.name}' with ${sop.steps.length} steps.`);

    for (let i = startStepIndex; i < sop.steps.length; i++) {
      const step = sop.steps[i];
      console.error(`[SOPEngine] Executing Step: ${step.name}`);

      if (step.condition) {
          if (!this.evaluateCondition(step.condition, context)) {
              console.error(`[SOPEngine] Step skipped (condition false): ${step.condition}`);
              logs.push({
                  step: step.name,
                  status: "skipped",
                  timestamp: new Date().toISOString()
              });
              this.saveState(name, i, context);
              continue;
          }
      }

      try {
          const output = await this.workflowAgent.executeStep(step, context);

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

          this.saveState(name, i, context);

      } catch (e: any) {
          console.error(`[SOPEngine] Step execution failed: ${e.message}`);
          await this.contextManager.logChange(`SOP '${sop.name}' failed at step '${step.name}': ${e.message}`);

          if (step.rollback) {
             try {
                 console.log(`[SOPEngine] Initiating Rollback for step '${step.name}'...`);
                 const rollbackStep = {
                     name: `Rollback: ${step.name}`,
                     description: `Rollback for ${step.name}`,
                     tool: step.rollback.tool,
                     args: step.rollback.args
                 };
                 await this.workflowAgent.executeStep(rollbackStep, context);
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
    }

    await this.contextManager.logChange(`Completed execution of SOP '${sop.name}' successfully.`);

    return {
        success: true,
        output: context,
        logs
    };
  }
}
