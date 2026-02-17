import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createLLM, LLM } from "../../llm.js";
import { fileURLToPath } from "url";
import { join } from "path";
import { readFileSync, existsSync } from "fs";

interface AgentConfig {
  command?: string;
  args?: string[];
  description?: string;
  [key: string]: any;
}

interface AgentMetrics {
  totalResponseTime: number;
  requestCount: number;
  successCount: number;
  failureCount: number;
  totalCost: number;
}

export class SmartRouterServer {
  private server: McpServer;
  private llm: LLM;
  private metrics: Map<string, AgentMetrics> = new Map();
  private agents: Map<string, AgentConfig> = new Map();

  constructor(llm?: LLM) {
    this.server = new McpServer({
      name: "smart-router",
      version: "1.0.0",
    });

    this.llm = llm || createLLM();
    this.loadAgents();
    this.setupTools();
  }

  private loadAgents() {
    const configFiles = ["mcp.json", "mcp.docker.json"];
    let loaded = false;

    for (const file of configFiles) {
      const configPath = join(process.cwd(), file);
      if (existsSync(configPath)) {
        try {
          const config = JSON.parse(readFileSync(configPath, "utf-8"));
          const agents = config.agents || {};
          for (const [name, cfg] of Object.entries(agents)) {
            this.agents.set(name, cfg as AgentConfig);
            // Initialize metrics if not present
            if (!this.metrics.has(name)) {
              this.metrics.set(name, {
                totalResponseTime: 0,
                requestCount: 0,
                successCount: 0,
                failureCount: 0,
                totalCost: 0,
              });
            }
          }
          loaded = true;
          break;
        } catch (e) {
          console.error(`Error loading ${file}:`, e);
        }
      }
    }

    if (!loaded) {
      console.warn("No agent configuration found. Using default agents for fallback.");
      // Fallback defaults if no config found (e.g. for testing)
      const defaults = {
        "coder": { description: "Specialized in writing code." },
        "researcher": { description: "Specialized in gathering information." },
        "planner": { description: "Specialized in creating plans." }
      };
      for (const [name, cfg] of Object.entries(defaults)) {
        this.agents.set(name, cfg);
        this.metrics.set(name, {
            totalResponseTime: 0,
            requestCount: 0,
            successCount: 0,
            failureCount: 0,
            totalCost: 0,
        });
      }
    }
  }

  private setupTools() {
    this.server.tool(
      "route_task",
      "Analyze a task and recommend the best agent based on capabilities and performance metrics.",
      {
        task_description: z.string().describe("The description of the task to be performed."),
        budget_tokens: z.number().optional().describe("Optional budget in tokens."),
        priority: z.enum(["low", "medium", "high"]).optional().describe("Task priority."),
      },
      async ({ task_description, budget_tokens, priority }) => {
        const agentsList = Array.from(this.agents.entries()).map(([name, cfg]) => {
          const m = this.metrics.get(name)!;
          const avgTime = m.requestCount > 0 ? (m.totalResponseTime / m.requestCount).toFixed(0) : "N/A";
          const successRate = m.requestCount > 0 ? ((m.successCount / m.requestCount) * 100).toFixed(1) + "%" : "N/A";
          return `- ${name}: ${cfg.description || "No description"} (Avg Time: ${avgTime}ms, Success: ${successRate})`;
        }).join("\n");

        const prompt = `
You are a Smart Router for an autonomous agent system.
Your goal is to select the best agent for a given task based on capabilities and past performance.

Available Agents:
${agentsList}

Task:
${task_description}

Priority: ${priority || "medium"}
Budget: ${budget_tokens ? budget_tokens + " tokens" : "N/A"}

Return a JSON object with:
- recommended_agent: (string) The name of the best agent.
- confidence_score: (number) 0-1 confidence level.
- estimated_cost: (number) Estimated cost in USD (assume $0.01 per 1k tokens as a baseline, adjust for complexity).
- reasoning: (string) Brief explanation of why this agent was chosen.
`;

        try {
          const response = await this.llm.generate(
            "You are a helpful assistant that outputs JSON only.",
            [{ role: "user", content: prompt }]
          );

          // The LLM response might be wrapped in markdown code blocks or have extra text.
          // The LLM class handles parsing JSON in most cases, but let's be safe.
           // Note: llm.generate returns parsed object if it detects JSON, or raw text.
           // However, the LLM class implementation I saw earlier returns { thought, tool, args, message, raw }.
           // Wait, I need to check how LLM returns data.
           // It returns `LLMResponse`. If I ask for JSON, it might put it in `message` or `args` if it thinks it's a tool call.
           // But here I'm asking for a JSON response, not a tool call.
           // The LLM class's `parse` method tries to find JSON.

           // If the model follows instruction, `response.message` or `response.raw` should contain the JSON.
           // Or if it thinks it is calling a tool, `response.tool` might be relevant? No, I am not providing tools to the LLM here.
           // So it will likely just return text.

           let result: any = {};
           try {
             // Try to parse message as JSON if LLM class didn't parse it as tool args
             const jsonMatch = response.message.match(/\{[\s\S]*\}/);
             if (jsonMatch) {
               result = JSON.parse(jsonMatch[0]);
             } else {
                // If LLM class parsed it into args (unlikely without tools definition but possible if it hallucinates a tool)
                result = response.args || {};
             }
           } catch (e) {
             console.error("Failed to parse LLM response as JSON:", response.raw);
             // Fallback
             return {
               content: [{ type: "text", text: JSON.stringify({
                 recommended_agent: "unknown",
                 confidence_score: 0,
                 estimated_cost: 0,
                 reasoning: "Failed to parse router decision."
               }) }]
             };
           }

           // Validate keys
           if (!result.recommended_agent) {
             // Fallback
              const fallbackAgent = Array.from(this.agents.keys())[0] || "unknown";
              result = {
                recommended_agent: fallbackAgent,
                confidence_score: 0.1,
                estimated_cost: 0,
                reasoning: "LLM failed to return valid JSON. Defaulting."
              };
           }

           return {
             content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
           };

        } catch (error: any) {
           return {
             content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
             isError: true
           };
        }
      }
    );

    this.server.tool(
      "report_outcome",
      "Report the outcome of a task execution to update agent metrics.",
      {
        agent_id: z.string().describe("The ID of the agent that performed the task."),
        success: z.boolean().describe("Whether the task was successful."),
        duration_ms: z.number().describe("Time taken in milliseconds."),
        cost: z.number().describe("Cost incurred in USD."),
      },
      async ({ agent_id, success, duration_ms, cost }) => {
        if (!this.agents.has(agent_id)) {
           return {
             content: [{ type: "text", text: `Error: Agent '${agent_id}' not found.` }],
             isError: true
           };
        }

        const m = this.metrics.get(agent_id)!;
        m.requestCount++;
        m.totalResponseTime += duration_ms;
        m.totalCost += cost;
        if (success) {
          m.successCount++;
        } else {
          m.failureCount++;
        }

        return {
          content: [{ type: "text", text: `Metrics updated for agent '${agent_id}'.` }]
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Smart Router MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SmartRouterServer();
  server.run().catch((err) => {
    console.error("Fatal error in Smart Router MCP Server:", err);
    process.exit(1);
  });
}
