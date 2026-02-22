import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { MCP } from "../../mcp.js";

export class DreamingServer {
  private server: McpServer;
  private mcp: MCP;
  private sopLogsPath: string;

  constructor() {
    this.server = new McpServer({
      name: "dreaming",
      version: "1.0.0",
    });
    this.mcp = new MCP();
    // Path to sop_logs.json used by HR Loop
    this.sopLogsPath = join(process.cwd(), ".agent", "brain", "sop_logs.json");

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "start_dreaming_session",
      "Starts an offline simulation session to retry past failures and learn new strategies.",
      {
        limit: z.number().optional().default(5).describe("Number of recent failures to process."),
        company: z.string().optional().describe("The company/client identifier for namespacing."),
      },
      async ({ limit, company }) => {
        return await this.startDreamingSession(limit, company);
      }
    );
  }

  private async startDreamingSession(limit: number, company?: string) {
    try {
      await this.mcp.init();

      // 1. Get Brain Client
      const brainClient = this.mcp.getClient("brain");
      if (!brainClient) {
        return {
          content: [{ type: "text", text: "Error: Brain MCP server not available." }],
          isError: true,
        };
      }

      // 2. Query for failures
      // We search for "failure", "error", "failed"
      const queryResult: any = await brainClient.callTool({
        name: "brain_query",
        arguments: {
          query: "failure error failed",
          limit: limit,
          company: company,
        },
      });

      const failuresText = queryResult.content[0].text;
      if (failuresText.includes("No relevant memories found")) {
        return {
          content: [{ type: "text", text: "No past failures found to dream about." }],
        };
      }

      // 3. Parse Failures
      const failures = this.parseFailures(failuresText);
      if (failures.length === 0) {
        return {
          content: [{ type: "text", text: "Could not parse any failures from brain query." }],
        };
      }

      // 4. Get Swarm Client
      const swarmClient = this.mcp.getClient("swarm");
      if (!swarmClient) {
        return {
          content: [{ type: "text", text: "Error: Swarm MCP server not available." }],
          isError: true,
        };
      }

      let successCount = 0;
      const results = [];

      // 5. Simulate each failure
      for (const failure of failures) {
        const taskDescription = `Retry past failure. Original Request: "${failure.request}". Context: ${failure.solution}`;

        try {
          // Use run_simulation on Swarm
          const simResult: any = await swarmClient.callTool({
            name: "run_simulation",
            arguments: {
              task: taskDescription,
              context: `Previous Attempt Failed:\n${failure.solution}\n\nArtifacts: ${failure.artifacts}`,
              company_id: company,
            },
          });

          const simOutputText = simResult.content[0].text;
          let simOutput;
          try {
             simOutput = JSON.parse(simOutputText);
          } catch {
             simOutput = { status: "unknown", result: simOutputText };
          }

          if (simOutput.status === "success") {
            successCount++;
            results.push(`Task ${failure.taskId}: SUCCESS`);

            // Store in Brain
            await brainClient.callTool({
              name: "brain_store",
              arguments: {
                taskId: `dream-fix-${failure.taskId}`,
                request: `Dreaming Simulation: Fix for ${failure.taskId}`,
                solution: `Outcome: Success\nStrategy: ${simOutput.result}`,
                artifacts: JSON.stringify(simOutput.artifacts || []),
                company: company,
              },
            });

            // Log to HR (sop_logs.json)
            await this.logToHR(failure.taskId, simOutput.result);

          } else {
            results.push(`Task ${failure.taskId}: FAILED`);
          }

        } catch (e: any) {
          results.push(`Task ${failure.taskId}: ERROR (${e.message})`);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Dreaming Session Complete.\nProcessed: ${failures.length}\nSuccess: ${successCount}\nResults:\n${results.join("\n")}`,
          },
        ],
      };

    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error during dreaming session: ${e.message}` }],
        isError: true,
      };
    }
  }

  private parseFailures(text: string): Array<{ taskId: string; request: string; solution: string; artifacts: string }> {
    const failures: Array<{ taskId: string; request: string; solution: string; artifacts: string }> = [];
    const blocks = text.split("\n\n---\n\n");

    for (const block of blocks) {
      const taskIdMatch = block.match(/\[Task: (.+?)\]/);
      const requestMatch = block.match(/Request: ([\s\S]+?)\nSolution:/);
      const solutionMatch = block.match(/Solution: ([\s\S]+?)\nArtifacts:/);
      const artifactsMatch = block.match(/Artifacts: (.+)/);

      if (taskIdMatch) {
        failures.push({
          taskId: taskIdMatch[1],
          request: requestMatch ? requestMatch[1].trim() : "Unknown Request",
          solution: solutionMatch ? solutionMatch[1].trim() : "Unknown Solution",
          artifacts: artifactsMatch ? artifactsMatch[1].trim() : "None",
        });
      }
    }
    return failures;
  }

  private async logToHR(taskId: string, strategy: string) {
    // Append to sop_logs.json
    // We try to be atomic but file locking is tricky without proper-lockfile.
    // For now, we just read/write.

    // Ensure directory exists
    const dir = join(process.cwd(), ".agent", "brain");
    if (!existsSync(dir)) {
        try {
            await mkdir(dir, { recursive: true });
            await writeFile(this.sopLogsPath, "[]");
        } catch {}
    }

    let logs: any[] = [];
    if (existsSync(this.sopLogsPath)) {
        try {
            const content = await readFile(this.sopLogsPath, "utf-8");
            logs = JSON.parse(content);
        } catch {
            logs = [];
        }
    }

    const entry = {
        timestamp: new Date().toISOString(),
        sop: "dreaming_simulation",
        result: {
            success: true,
            logs: [
                { step: "simulation", output: `Successfully simulated fix for ${taskId}. Strategy: ${strategy.slice(0, 100)}...`, status: "success" }
            ]
        },
        step: "completed",
        status: "success",
        details: `Dreaming simulation for task ${taskId}`
    };

    logs.push(entry);

    // Keep logs manageable (last 1000)
    if (logs.length > 1000) logs = logs.slice(-1000);

    try {
        await writeFile(this.sopLogsPath, JSON.stringify(logs, null, 2));
    } catch (e) {
        console.error("Failed to write to sop_logs.json:", e);
    }
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
