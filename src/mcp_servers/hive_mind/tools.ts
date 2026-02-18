import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Engine, Registry, Context } from "../../engine/orchestrator.js";
import { createLLM, LLM } from "../../llm.js";
import { MCP } from "../../mcp.js";
import { Agent, Task, Bid } from "./types.js";
import { builtinSkills, Skill } from "../../skills.js";
import { v4 as uuidv4 } from "uuid";
import { EpisodicMemory } from "../../brain/episodic.js";

// Extended Engine to access protected properties safely
class HiveEngine extends Engine {
    public get publicLLM(): LLM { return this.llm; }
    public get publicRegistry(): Registry { return this.registry; }
    public get publicMCP(): MCP { return this.mcp; }

    // Helper to execute one turn
    async runTurn(context: Context, history: any[], signal?: AbortSignal) {
        // Ensure tools are loaded
        await this.mcp.init();
        (await this.mcp.getTools()).forEach((t: any) =>
            this.registry.tools.set(t.name, t)
        );

        const prompt = await context.buildPrompt(this.registry.tools, this.registry);
        // Combine history + current prompt context if needed, but Engine.run handles context injection differently.
        // For sub-agents, we rely on the context passed in history.

        return await this.llm.generate(prompt, history, signal);
    }
}

interface HiveMindState {
  activeAgents: Map<string, Agent>;
  episodicMemory: EpisodicMemory;
}

const MAX_TURNS = 5;
const MAX_RETRIES = 3;

async function executeWithBackoff<T>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await fn();
        } catch (e: any) {
            attempt++;
            if (attempt >= retries) throw e;
            const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s...
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw new Error("Max retries exceeded"); // Should not reach here
}

export function registerTools(server: McpServer, state: HiveMindState) {
  // --- Spawn Sub-Agent ---
  server.tool(
    "spawn_sub_agent",
    "Spawns a new autonomous sub-agent with a specific role and constraints.",
    {
      role: z.string().describe("The role of the agent (e.g., 'QA Engineer', 'React Specialist')."),
      task_description: z.string().describe("What this agent is responsible for."),
      constraints: z.string().optional().describe("Operational constraints (e.g., 'Do not edit config files')."),
      company_id: z.string().optional().describe("The company context ID to load."),
    },
    async ({ role, task_description, constraints, company_id }) => {
      const id = uuidv4();
      const llm = createLLM();
      const mcp = new MCP();
      const registry = new Registry();

      // Initialize MCP for the sub-agent
      await mcp.init();

      const engine = new HiveEngine(llm, registry, mcp);

      const baseSkill = builtinSkills.code || builtinSkills.general;
      const customSkill: Skill = {
        name: role,
        description: task_description,
        systemPrompt: `You are a ${role}.\n\nResponsibility: ${task_description}\n\nConstraints: ${constraints || "None"}\n\n${baseSkill.systemPrompt}`,
      };

      const context = new Context(process.cwd(), customSkill);

      const agent: Agent = {
        id,
        role,
        engine,
        context,
        status: "idle",
        companyId: company_id,
        capabilities: [role],
      };

      state.activeAgents.set(id, agent);

      return {
        content: [{ type: "text", text: `Spawned agent ${id} (${role}).` }],
      };
    }
  );

  // --- Orchestrate Workflow ---
  server.tool(
    "orchestrate_workflow",
    "Executes a sequence of steps, dynamically assigning them to agents.",
    {
      steps: z.array(z.object({
        id: z.string(),
        description: z.string(),
        dependencies: z.array(z.string()).optional(),
        assigned_role: z.string().optional(),
      })).describe("List of steps to execute."),
      company_id: z.string().optional(),
    },
    async ({ steps, company_id }) => {
      const results: Record<string, string> = {};
      const errors: string[] = [];

      for (const step of steps) {
        // Find or Spawn Agent
        let agent = Array.from(state.activeAgents.values()).find(
          a => a.status === "idle" && (step.assigned_role ? a.role.toLowerCase().includes(step.assigned_role.toLowerCase()) : true)
        );

        if (!agent) {
           const role = step.assigned_role || "General Worker";
           const id = uuidv4();
           const llm = createLLM();
           const mcp = new MCP();
           await mcp.init();
           const registry = new Registry();
           const engine = new HiveEngine(llm, registry, mcp);
           const baseSkill = builtinSkills.general_developer || builtinSkills.code;
           const customSkill: Skill = {
                name: role,
                description: "Auto-spawned worker",
                systemPrompt: `You are a ${role}.\nTask: ${step.description}\n\n${baseSkill.systemPrompt}`,
           };
           const context = new Context(process.cwd(), customSkill);
           agent = { id, role, engine, context, status: "idle", companyId: company_id, capabilities: [role] };
           state.activeAgents.set(id, agent);
        }

        agent.status = "busy";
        const engine = agent.engine as HiveEngine; // Cast to HiveEngine

        try {
            await state.episodicMemory.store(
                step.id,
                `Delegated to ${agent.role} (${agent.id})`,
                `Pending execution of: ${step.description}`,
                ["none"], // Avoid empty array for LanceDB inference
                company_id
            );

            // Execute with Backoff
            const finalResult = await executeWithBackoff(async () => {
                const ctx = agent!.context;
                // Reset history for new task or append? Usually agents keep history, but for workflow steps, maybe isolate context?
                // Let's keep history to maintain persona consistency but add a clear separator.
                const history = [...ctx.history, { role: "user", content: step.description }];

                let turns = 0;
                let taskComplete = false;
                let lastResponse = "";

                while (turns < MAX_TURNS && !taskComplete) {
                    const response = await engine.runTurn(ctx, history);

                    const content = response.message || response.thought || "";
                    lastResponse = content;

                    // Execute tools
                    if (response.tools && response.tools.length > 0) {
                         const toolOutputs: any[] = [];
                         for (const t of response.tools) {
                             const toolDef = engine.publicRegistry.tools.get(t.tool);
                             if (toolDef) {
                                 const tRes = await toolDef.execute(t.args);
                                 toolOutputs.push({ tool: t.tool, result: tRes });
                             } else {
                                 toolOutputs.push({ tool: t.tool, error: "Tool not found" });
                             }
                         }

                         // Feed back tool outputs
                         history.push({ role: "assistant", content: JSON.stringify(response) });
                         history.push({ role: "user", content: `Tool Outputs: ${JSON.stringify(toolOutputs)}` });
                    } else {
                        // No tools called, assume completion if message present
                        if (response.message) {
                            taskComplete = true;
                        } else {
                            // If only thought, continue? Or stop?
                            // Usually "thought" implies internal monologue, "message" implies output.
                            // If strict format, we expect "message".
                            taskComplete = true;
                        }
                    }
                    turns++;
                }

                if (!taskComplete) {
                    throw new Error("Agent exceeded max turns without completion.");
                }

                return lastResponse;
            });

            results[step.id] = finalResult;
            agent.status = "idle";

            await state.episodicMemory.store(
                step.id,
                `Task: ${step.description}`,
                `Outcome: Success\nAgent: ${agent.role}\nResult: ${finalResult}`,
                ["none"],
                company_id
            );

        } catch (e: any) {
            agent.status = "idle";
            errors.push(`Step ${step.id} failed: ${e.message}`);

             await state.episodicMemory.store(
                step.id,
                `Task: ${step.description}`,
                `Outcome: Failure\nAgent: ${agent.role}\nError: ${e.message}`,
                ["none"],
                company_id
            );
        }
      }

      if (errors.length > 0) {
          return {
              content: [{ type: "text", text: `Workflow completed with errors:\n${errors.join("\n")}\n\nSuccesses:\n${JSON.stringify(results, null, 2)}` }],
              isError: true
          };
      }

      return {
        content: [{ type: "text", text: `Workflow completed successfully.\n${JSON.stringify(results, null, 2)}` }],
      };
    }
  );

  // --- Negotiate Bid ---
  server.tool(
    "negotiate_bid",
    "Request bids from available agents for a specific task.",
    {
      task_description: z.string(),
      budget: z.number().optional(),
    },
    async ({ task_description }) => {
      const bids: Bid[] = [];
      const eligibleAgents = Array.from(state.activeAgents.values()).filter(a => a.status === "idle");

      if (eligibleAgents.length === 0) {
        return { content: [{ type: "text", text: "No idle agents available to bid." }] };
      }

      for (const agent of eligibleAgents) {
          const engine = agent.engine as HiveEngine;
          const prompt = `You are invited to bid on a task.\nTask: ${task_description}\n\nEstimate the complexity (1-10) and provide a brief proposal. Return JSON: { "complexity": number, "proposal": string }.`;

          try {
            const res = await engine.publicLLM.generate(prompt, []);
            let parsed: any = {};
            try {
                parsed = JSON.parse(res.message || res.raw || "{}");
            } catch {
                const complexity = (res.message || "").match(/complexity"?:?\s*(\d+)/i)?.[1];
                parsed = { complexity: complexity ? parseInt(complexity) : 5, proposal: res.message };
            }

            bids.push({
                agentId: agent.id,
                taskId: "unknown",
                cost: parsed.complexity || 5,
                confidence: 0.8,
                proposal: parsed.proposal || "I can do this."
            });

          } catch (e) {
              console.error(`Agent ${agent.id} failed to bid:`, e);
          }
      }

      bids.sort((a, b) => a.cost - b.cost);
      const winner = bids[0];

      return {
          content: [{
              type: "text",
              text: `Bidding complete.\nWinner: ${winner?.agentId} (Cost: ${winner?.cost})\nProposal: ${winner?.proposal}\n\nAll Bids:\n${JSON.stringify(bids, null, 2)}`
          }]
      };
    }
  );

  // --- Resolve Conflict ---
  server.tool(
    "resolve_conflict",
    "Resolves a conflict between two agents or a blockage.",
    {
       agent_a_id: z.string(),
       agent_b_id: z.string().optional(),
       issue: z.string(),
    },
    async ({ agent_a_id, agent_b_id, issue }) => {
        const llm = createLLM(); // Judge
        const agentA = state.activeAgents.get(agent_a_id);
        const agentB = agent_b_id ? state.activeAgents.get(agent_b_id) : undefined;

        const prompt = `You are a Conflict Resolution mediator.\n
        Issue: ${issue}\n
        Agent A (${agentA?.role}): ${agentA?.status}\n
        ${agentB ? `Agent B (${agentB.role}): ${agentB.status}\n` : ""}

        Propose a solution or a directive to resolve this.`;

        const decision = await llm.generate(prompt, []);

        return {
            content: [{ type: "text", text: `Resolution: ${decision.message || decision.thought}` }]
        };
    }
  );
}
