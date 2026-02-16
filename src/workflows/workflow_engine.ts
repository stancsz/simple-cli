import { Registry } from "../engine/orchestrator.js";
import { SOPRegistry } from "./sop_registry.js";
import { SOPDefinition, SOPStep } from "./sop_definition_schema.js";

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

export class WorkflowEngine {
  private registry: Registry;
  private sopRegistry: SOPRegistry;

  constructor(registry: Registry, sopRegistry?: SOPRegistry) {
    this.registry = registry;
    this.sopRegistry = sopRegistry || new SOPRegistry();
  }

  private interpolate(template: any, context: Record<string, any>): any {
    if (typeof template === "string") {
      // Check for exact variable match (e.g. "{{ var }}") to preserve type
      const exactMatch = template.match(/^\{\{\s*([\w\.]+)\s*\}\}$/);
      if (exactMatch) {
        const key = exactMatch[1];
        const value = this.resolvePath(context, key);
        return value !== undefined ? value : template;
      }

      // String interpolation (e.g. "Value is {{ var }}") -> converts to string
      return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (_, key) => {
        const value = this.resolvePath(context, key);
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
    // Simple condition: "{{ var }} == 'value'"
    // Or just "{{ var }}" for truthiness

    // Replace variables first (might return non-string)
    const interpolated = this.interpolate(condition, context);

    if (typeof interpolated === 'boolean') return interpolated;
    if (interpolated === null || interpolated === undefined) return false;
    if (typeof interpolated === 'number') return interpolated !== 0;

    // If it's a string, try to parse simple comparisons
    if (typeof interpolated === 'string') {
        // Check for equality
        const eqMatch = interpolated.match(/^(.*?)\s*==\s*(.*)$/);
        if (eqMatch) {
        let [, left, right] = eqMatch;
        // Remove quotes if present
        left = left.trim().replace(/^['"]|['"]$/g, "");
        right = right.trim().replace(/^['"]|['"]$/g, "");
        return left === right;
        }

        // Check for inequality
        const neqMatch = interpolated.match(/^(.*?)\s*!=\s*(.*)$/);
        if (neqMatch) {
        let [, left, right] = neqMatch;
        left = left.trim().replace(/^['"]|['"]$/g, "");
        right = right.trim().replace(/^['"]|['"]$/g, "");
        return left !== right;
        }

        // Default: Check if truthy (not "false", "null", "undefined", "0", "")
        if (interpolated === "false" || interpolated === "null" || interpolated === "undefined" || interpolated === "") {
            return false;
        }
        return true;
    }

    // Default truthy check for objects/arrays
    return !!interpolated;
  }

  async executeSOP(name: string, params: Record<string, any> = {}): Promise<ExecutionResult> {
    const sop = await this.sopRegistry.getSOP(name);
    if (!sop) {
      return {
        success: false,
        error: `SOP '${name}' not found.`,
        logs: [],
      };
    }

    const context: Record<string, any> = {
      params,
      steps: {},
    };

    const logs: ExecutionLog[] = [];

    for (const step of sop.steps) {
      const stepName = step.name || step.tool;

      // Check condition
      if (step.condition) {
        if (!this.evaluateCondition(step.condition, context)) {
          logs.push({
            step: stepName,
            status: "skipped",
            timestamp: new Date().toISOString(),
          });
          continue;
        }
      }

      // Prepare args
      const toolArgs = this.interpolate(step.args, context);
      const tool = this.registry.tools.get(step.tool);

      if (!tool) {
         logs.push({
          step: stepName,
          status: "failure",
          error: `Tool '${step.tool}' not found.`,
          timestamp: new Date().toISOString(),
        });
        return { success: false, error: `Tool '${step.tool}' not found.`, logs };
      }

      let attempt = 0;
      const maxRetries = step.retry_count || 0;
      let success = false;
      let output: any;
      let error: any;

      while (attempt <= maxRetries && !success) {
        try {
          output = await tool.execute(toolArgs);
          success = true;
        } catch (e: any) {
          error = e.message;
          attempt++;
          if (attempt <= maxRetries) {
            console.log(`Retrying step '${stepName}' (Attempt ${attempt}/${maxRetries})...`);
          }
        }
      }

      if (success) {
        // Store output in context
        // If output is JSON string, try to parse it
        try {
            if (typeof output === 'string' && (output.startsWith('{') || output.startsWith('['))) {
                 context.steps[stepName] = JSON.parse(output);
            } else {
                 context.steps[stepName] = output;
            }
        } catch {
             context.steps[stepName] = output;
        }

        logs.push({
          step: stepName,
          status: "success",
          output,
          timestamp: new Date().toISOString(),
        });
      } else {
        logs.push({
          step: stepName,
          status: "failure",
          error,
          timestamp: new Date().toISOString(),
        });

        if (step.on_failure === "continue") {
          continue;
        } else {
          return {
            success: false,
            error: `Step '${stepName}' failed after ${attempt} attempts: ${error}`,
            logs,
          };
        }
      }
    }

    return {
      success: true,
      output: "SOP execution completed successfully.",
      logs,
    };
  }
}
