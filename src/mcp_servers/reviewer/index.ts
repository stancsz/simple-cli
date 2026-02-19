import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Reviewer } from "../../reviewer/index.js";
import { MCP } from "../../mcp.js";
import { ReviewerAgent } from "../../agents/reviewer_agent.js";

const server = new McpServer({
  name: "reviewer",
  version: "1.0.0",
});

server.tool(
  "run_morning_standup",
  "Run the Morning Standup review, analyzing logs from the last 24 hours.",
  {},
  async () => {
    const reviewer = new Reviewer(process.cwd());
    const report = await reviewer.runMorningStandup();
    return {
      content: [
        {
          type: "text",
          text: report,
        },
      ],
    };
  }
);

server.tool(
  "review_hourly",
  "Run an hourly review of recent tasks, incorporating past insights from the Brain.",
  {},
  async () => {
    const reviewer = new Reviewer(process.cwd());
    const logs = await reviewer.getRecentLogs(60 * 60 * 1000); // 1 hour

    if (logs.length === 0) {
      return {
        content: [{ type: "text", text: "No tasks executed in the last hour to review." }]
      };
    }

    // Connect to Brain via MCP client
    const mcp = new MCP();
    let insights = "";
    try {
        await mcp.init();
        const servers = mcp.listServers();
        if (servers.find((s) => s.name === "brain" && s.status === "stopped")) {
            await mcp.startServer("brain");
        }
        const client = mcp.getClient("brain");
        if (client) {
             const res: any = await client.callTool({
                 name: "brain_query",
                 arguments: { query: "code review preferences common bugs", limit: 3 }
             });
             if (res && res.content && res.content[0]) {
                 insights = res.content[0].text;
             }
        }
    } catch (e) {
        console.warn("Failed to query brain for review insights:", e);
    }

    const agent = new ReviewerAgent();
    let report = `Hourly Review (Tasks: ${logs.length})\nInsights Applied: ${insights || "None"}\n\n`;

    for (const log of logs) {
        const taskDef = {
            id: log.taskId,
            name: log.taskName || log.taskId,
            company: log.company || undefined,
            // dummy values for TaskDefinition
            trigger: 'cron',
            prompt: "Reviewed via hourly review",
        };

        const result = await agent.reviewTask(taskDef as any, [], insights);
        report += `- **${taskDef.name}**: ${result.approved ? "Approved" : "Rejected"}\n  Feedback: ${result.feedback}\n`;
    }

    return {
      content: [{ type: "text", text: report }]
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Reviewer MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
