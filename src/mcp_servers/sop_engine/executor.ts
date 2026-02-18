import { LLM } from '../../llm.js';
import { MCP } from '../../mcp.js';
import { SOP } from './sop_parser.js';

export class SOPExecutor {
  private llm: LLM;
  private mcp: MCP;
  private maxRetries = 5;

  constructor(llm: LLM, mcp: MCP) {
    this.llm = llm;
    this.mcp = mcp;
  }

  async execute(sop: SOP, input: string): Promise<string> {
    // Initialize MCP to discover servers
    await this.mcp.init();

    // Auto-start common servers if not running?
    // We'll let the agent decide or auto-start via Orchestrator logic if we were Orchestrator.
    // Here we are a standalone engine. We should probably try to start 'brain' and 'filesystem' at least?
    // Let's just rely on the agent using mcp_start_server if needed, or maybe start all local servers?
    // Starting all might be slow.
    // Let's start 'filesystem' and 'git' if available as they are core for "SOPs".
    // But we don't know their names for sure.
    // We'll rely on tool discovery.

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

Current Step: ${step.number}. ${step.name}
Instructions: ${step.description}

History of previous steps:
${context.join("\n") || "None"}

Available Tools:
${toolDefs}

Your Goal: Execute the current step using available tools.
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
            if (e.isFatal) throw e;
            console.error(`[SOP] Error in step execution: ${e.message}`);
            retries++;
            fullHistory.push({ role: 'user', content: `System Error: ${e.message}` });
        }
      }

      if (!stepComplete) {
          throw new Error(`Failed to complete Step ${step.number} after ${this.maxRetries} retries.`);
      }
    }

    return `SOP '${sop.title}' executed successfully.\n\nSummary:\n${context.join('\n')}`;
  }
}
