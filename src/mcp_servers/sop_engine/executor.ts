import { LLM } from '../../llm.js';
import { MCP } from '../../mcp.js';
import { SOP } from './sop_parser.js';
import { writeFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

export class SOPExecutor {
  private llm: LLM;
  private mcp: MCP;
  private maxRetries = 3;
  private logDir: string;

  constructor(llm: LLM, mcp: MCP) {
    this.llm = llm;
    this.mcp = mcp;
    this.logDir = join(process.cwd(), '.agent', 'brain');
  }

  private async logStep(sopName: string, stepNumber: number, status: 'success' | 'failure', details: string) {
    if (!existsSync(this.logDir)) {
      await mkdir(this.logDir, { recursive: true });
    }
    const logFile = join(this.logDir, 'sop_logs.json');
    let logs: any[] = [];
    if (existsSync(logFile)) {
      try {
        const content = await readFile(logFile, 'utf-8');
        logs = JSON.parse(content);
      } catch (e) {
        logs = [];
      }
    }

    logs.push({
      timestamp: new Date().toISOString(),
      sop: sopName,
      step: stepNumber,
      status,
      details
    });

    // Keep last 1000 logs
    if (logs.length > 1000) logs = logs.slice(-1000);

    await writeFile(logFile, JSON.stringify(logs, null, 2));
  }

  async execute(sop: SOP, input: string): Promise<string> {
    // Initialize MCP to discover servers
    await this.mcp.init();

    // 1. Query Brain for past experiences
    let pastContext = "";
    try {
        // Attempt to find brain_query tool
        const tools = await this.mcp.getTools();
        const brainQuery = tools.find(t => t.name === 'brain_query');
        if (brainQuery) {
            const result = await brainQuery.execute({ query: `SOP execution: ${sop.title} ${input}`, limit: 3 });
            // Check if result is string or object with content
            if (typeof result === 'string') {
                pastContext = result;
            } else if (result && typeof result === 'object' && 'content' in result && Array.isArray((result as any).content)) {
                pastContext = (result as any).content.map((c: any) => c.text).join('\n');
            }
        }
    } catch (e) {
        console.error(`[SOP] Failed to query brain: ${(e as Error).message}`);
    }

    const context: string[] = []; // Stores summary of completed steps
    let fullHistory: any[] = [];  // Stores conversation history for the current step

    // Define internal control tools
    const controlTools = [
      {
        name: "complete_step",
        description: "Mark the current step as completed successfully.",
        inputSchema: { type: "object", properties: { summary: { type: "string" } } },
        execute: async (args: any) => { return args; } // Dummy execution
      },
      {
        name: "fail_step",
        description: "Mark the current step as failed.",
        inputSchema: { type: "object", properties: { reason: { type: "string" } } },
        execute: async (args: any) => { return args; }
      }
    ];

    for (const step of sop.steps) {
      console.error(`[SOP] Executing Step ${step.number}: ${step.name}`);
      let stepComplete = false;
      let retries = 0;

      // Reset history for new step to keep focus, but retain context summary
      fullHistory = [];

      while (!stepComplete && retries < this.maxRetries) {
        // Refresh tools (in case a server was started)
        const mcpTools = await this.mcp.getTools();
        const availableTools = [...mcpTools, ...controlTools];

        const toolDefs = availableTools.map((t: any) => {
            const schema = t.inputSchema || {};
            const args = schema.properties ? Object.keys(schema.properties).join(", ") : "";
            return `- ${t.name}(${args}): ${t.description}`;
        }).join("\n");

        const systemPrompt = `You are an autonomous agent executing a Standard Operating Procedure (SOP).
SOP Title: ${sop.title}
SOP Description: ${sop.description}
Original Input: ${input}

Relevant Past Experiences:
${pastContext || "None"}

Current Step: ${step.number}. ${step.name}
Instructions: ${step.description}

History of previous steps:
${context.join("\n") || "None"}

Available Tools:
${toolDefs}

Your Goal: Execute the current step using available tools.
Decision Guidance:
- For privacy-sensitive or local coding tasks, use 'run_supervisor_task' (Planning) or 'run_coding_task' (Implementation).
- For general file edits, use native filesystem tools or 'aider'.

1. If you need a tool that is not listed, check if you can start an MCP server using 'mcp_start_server' (e.g. 'git', 'filesystem').
2. When the step is done, use 'complete_step' with a summary.
3. If you cannot complete the step, use 'fail_step' with a reason.
Do not ask the user for input unless absolutely necessary.
`;

        try {
            const response = await this.llm.generate(systemPrompt, fullHistory);

            const { tool, args, thought, message } = response;

            if (thought) console.error(`[SOP] Thought: ${thought}`);
            if (message) console.error(`[SOP] Message: ${message}`);

            // Update history
            fullHistory.push({ role: 'assistant', content: message || thought || "" });

            // Handle Tool Execution
            if (tool) {
                if (tool === 'complete_step') {
                    const summary = args.summary || message || "Step completed.";
                    context.push(`Step ${step.number} completed: ${summary}`);
                    console.error(`[SOP] Step ${step.number} Complete.`);
                    await this.logStep(sop.title, step.number, 'success', summary);
                    stepComplete = true;
                    break;
                }

                if (tool === 'fail_step') {
                    const err = new Error(args.reason || "Step failed explicitly.");
                    (err as any).isFatal = true;
                    throw err;
                }

                if (tool !== 'none') {
                    const t = availableTools.find((x: any) => x.name === tool);
                    if (t) {
                        console.error(`[SOP] Executing tool: ${tool}`);
                        try {
                            // Execute tool
                            const result = await t.execute(args);

                            // Add result to history
                            fullHistory.push({
                                role: 'user',
                                content: `Tool '${tool}' output: ${typeof result === 'string' ? result : JSON.stringify(result)}`
                            });

                        } catch (e: any) {
                             console.error(`[SOP] Tool Error: ${e.message}`);
                             fullHistory.push({ role: 'user', content: `Tool '${tool}' failed: ${e.message}` });
                        }
                    } else {
                         console.error(`[SOP] Tool not found: ${tool}`);
                         fullHistory.push({ role: 'user', content: `Error: Tool '${tool}' not found. Check spelling or available tools.` });
                    }
                } else {
                    // Tool is 'none', but message exists.
                    // If the LLM is just talking, remind it to use tools.
                    fullHistory.push({ role: 'user', content: "Please use a tool (like 'complete_step') to proceed." });
                }
            } else {
                 fullHistory.push({ role: 'user', content: "Please use a tool to proceed." });
            }

        } catch (e: any) {
            if (e.isFatal) {
                 await this.logStep(sop.title, step.number, 'failure', e.message);
                 throw e;
            }
            console.error(`[SOP] Error in step execution: ${e.message}`);

            // Exponential Backoff
            retries++;
            const delay = Math.pow(2, retries) * 1000;
            console.error(`[SOP] Retrying in ${delay}ms... (Attempt ${retries}/${this.maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));

            fullHistory.push({ role: 'user', content: `System Error: ${e.message}` });
        }
      }

      if (!stepComplete) {
          const msg = `Failed to complete Step ${step.number} after ${this.maxRetries} retries.`;
          await this.logStep(sop.title, step.number, 'failure', msg);
          throw new Error(msg);
      }
    }

    const finalSummary = `SOP '${sop.title}' executed successfully.\n\nSummary:\n${context.join('\n')}`;

    // Log final experience to Brain
    try {
        const tools = await this.mcp.getTools();
        const logExp = tools.find(t => t.name === 'log_experience');
        if (logExp) {
            await logExp.execute({
                taskId: `sop-${Date.now()}`,
                task_type: 'sop_execution',
                agent_used: 'sop_engine',
                outcome: 'success',
                summary: finalSummary,
                artifacts: JSON.stringify([]) // TODO: Track artifacts?
            });
        }
    } catch (e) {
        console.error(`[SOP] Failed to log experience: ${(e as Error).message}`);
    }

    return finalSummary;
  }
}
