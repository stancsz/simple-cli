import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { analyzeAgent, updateSoul, runHRLoop } from "../optimization/hr_loop.js";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { fileURLToPath } from "url";
import process from "process";

const server = new McpServer({
  name: "hr-loop",
  version: "1.0.0",
});

server.tool(
  "analyze_agent_performance",
  "Analyze the performance of a specific agent based on recent logs.",
  {
    agent_name: z.string().describe("The name of the agent to analyze (e.g., 'aider', 'crewai')."),
    days: z.number().optional().describe("Number of days of logs to analyze (default: 7)."),
  },
  async ({ agent_name, days }) => {
    try {
      const result = await analyzeAgent(agent_name, days || 7);
      return {
        content: [{ type: "text", text: result || "Analysis complete." }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "update_agent_soul",
  "Update the 'Soul' (System Instructions) of an agent with new instructions.",
  {
    agent_name: z.string().describe("The name of the agent to update."),
    new_instructions: z.string().describe("The new instructions to merge into the soul."),
  },
  async ({ agent_name, new_instructions }) => {
    try {
      await updateSoul(agent_name, new_instructions, "Manual update via tool.");
      return {
        content: [{ type: "text", text: `Soul for ${agent_name} updated successfully.` }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "run_hr_optimization",
  "Run the full HR optimization loop for all agents.",
  {},
  async () => {
    try {
      const result = await runHRLoop();
      return {
        content: [{ type: "text", text: result }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "schedule_hr_review",
  "Schedule a periodic HR review task.",
  {
    schedule: z.string().describe("Cron expression for the schedule (e.g., '0 0 * * 0' for weekly)."),
  },
  async ({ schedule }) => {
    try {
      const schedulerPath = join(process.cwd(), ".agent", "scheduler.json");
      let config: any = { tasks: [] };
      if (existsSync(schedulerPath)) {
        config = JSON.parse(await readFile(schedulerPath, "utf-8"));
      }

      const taskName = "Weekly HR Review";

      // Remove existing task with same name
      config.tasks = config.tasks.filter((t: any) => t.name !== taskName);

      config.tasks.push({
        id: "hr-review",
        name: taskName,
        trigger: "cron",
        schedule: schedule,
        prompt: "Run the HR optimization loop to analyze agent performance and update souls.",
        yoloMode: true
      });

      await writeFile(schedulerPath, JSON.stringify(config, null, 2));

      return {
        content: [{ type: "text", text: `Scheduled '${taskName}' with schedule '${schedule}'.` }],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error: ${e.message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HR Loop MCP Server running on stdio");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
