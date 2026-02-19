import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { DreamSimulator } from "./simulation.js";

export class DreamingServer {
  private server: McpServer;
  private simulator: DreamSimulator;

  constructor() {
    this.server = new McpServer({
      name: "dreaming",
      version: "1.0.0",
    });

    this.simulator = new DreamSimulator();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "start_dreaming_session",
      "Triggers an offline simulation session to replay past failures and generate new strategies.",
      {
        days: z.number().optional().default(7).describe("Number of days to look back for failures."),
      },
      async ({ days }) => {
        const failures = await this.simulator.scanFailures(days);
        if (failures.length === 0) {
          return {
            content: [{ type: "text", text: "No recent failures found to dream about." }],
          };
        }

        let summary = `Starting dreaming session for ${failures.length} failures.\n\n`;

        for (const failure of failures) {
          summary += `Processing failure: ${failure.task} (${failure.error})\n`;

          try {
            const strategy = await this.simulator.generateStrategy(failure);
            summary += `  Generated strategy: ${strategy.proposedApproach.substring(0, 50)}...\n`;

            // Simulate
            // In a real scenario, this might take time, so we might want to run this asynchronously
            // and return "Session started". But for this implementation, we run sequentially.
            const result = await this.simulator.runSimulation(strategy);

            if (result.outcome === "success") {
              await this.simulator.storeInsight(result);
              summary += `  Simulation SUCCESS. Insight stored.\n`;
            } else {
              summary += `  Simulation FAILED.\n`;
            }
          } catch (e: any) {
            summary += `  Error processing failure: ${e.message}\n`;
          }
          summary += "---\n";
        }

        return {
          content: [{ type: "text", text: summary }],
        };
      }
    );

    this.server.tool(
      "get_dream_insights",
      "Retrieves successful strategies generated from past simulations.",
      {
        query: z.string().describe("The task or problem to find insights for."),
        limit: z.number().optional().default(3),
      },
      async ({ query, limit }) => {
        const insights = await this.simulator.getInsights(query, limit);
        if (insights.length === 0) {
            return { content: [{ type: "text", text: "No dream insights found." }] };
        }
        return {
          content: [{ type: "text", text: insights.join("\n\n---\n\n") }],
        };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Dreaming MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new DreamingServer();
  server.run().catch((err) => {
    console.error("Fatal error in Dreaming MCP Server:", err);
    process.exit(1);
  });
}
