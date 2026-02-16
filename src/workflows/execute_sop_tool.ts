import { z } from "zod";
import { WorkflowEngine } from "./workflow_engine.js";

export const createExecuteSOPTool = (engine: WorkflowEngine) => ({
  name: "execute_sop",
  description: "Execute a Standard Operating Procedure (SOP) workflow by name.",
  inputSchema: z.object({
    name: z.string().describe("The name of the SOP to execute (without extension)."),
    params: z.record(z.any()).optional().describe("Key-value pairs for SOP parameters."),
  }),
  execute: async ({ name, params }: { name: string; params?: Record<string, any> }) => {
    const result = await engine.executeSOP(name, params || {});
    return JSON.stringify(result, null, 2);
  },
});
