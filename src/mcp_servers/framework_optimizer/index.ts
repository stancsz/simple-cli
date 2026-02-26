import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { MCP } from "../../mcp.js";
import { createLLM } from "../../llm.js";
import { join } from "path";
import { writeFile } from "fs/promises";

export class FrameworkOptimizerServer {
  private server: McpServer;
  private mcp: MCP;

  constructor() {
    this.server = new McpServer({
      name: "framework-optimizer",
      version: "1.0.0",
    });
    this.mcp = new MCP();
    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "propose_integration_optimization",
      "Analyzes past integration outcomes and proposes optimizations for SOPs.",
      {
        limit: z.number().optional().default(5).describe("Number of past outcomes to analyze."),
      },
      async ({ limit }) => {
        return await this.proposeOptimization(limit);
      }
    );
  }

  async proposeOptimization(limit: number) {
    await this.mcp.init();

    // Ensure Brain is available
    try {
        await this.mcp.startServer("brain");
    } catch (e) {}

    const brain = this.mcp.getClient("brain");
    if (!brain) {
        return { content: [{ type: "text", text: "Brain server not available." }], isError: true };
    }

    // Query Brain
    let outcomes: any[] = [];
    try {
        const res: any = await brain.callTool({
            name: "brain_query",
            arguments: {
                query: "integration outcome",
                type: "framework_integration_outcome",
                limit,
                format: "json"
            }
        });

        if (res && res.content && res.content[0]) {
            try {
                outcomes = JSON.parse(res.content[0].text);
            } catch {
                outcomes = [];
            }
        }
    } catch (e) {
        return { content: [{ type: "text", text: `Failed to query brain: ${(e as Error).message}` }], isError: true };
    }

    if (!Array.isArray(outcomes) || outcomes.length === 0) {
        return { content: [{ type: "text", text: "No framework integration outcomes found to analyze." }] };
    }

    // Prepare context for LLM
    const context = outcomes.map((o: any) => `
Task: ${o.taskId}
Request: ${o.request}
Outcome: ${o.solution}
Tokens: ${o.tokens || "N/A"}
Duration: ${o.duration || "N/A"}
`).join("\n---\n");

    const llm = createLLM();
    const systemPrompt = `You are an expert in AI Framework Integration and Process Optimization.
Your goal is to analyze the performance of past framework integrations and propose improvements to the Standard Operating Procedure (SOP).

Analyze the following integration outcomes. Look for patterns:
- Common failure modes.
- Correlations between framework types (CLI vs SDK) and success/failure.
- Code generation efficiency (LoC vs Tokens).

Output a Markdown document with:
1. **Analysis Summary**: Key findings.
2. **Proposed Optimizations**: Specific changes to the integration workflow or templates.
3. **Optimized SOP**: A refined version of the integration process.

The output will be saved to 'sops/framework_integration/optimized_patterns.md'.
`;

    const userPrompt = `Analyze these outcomes and propose optimizations:\n\n${context}`;

    try {
        const response = await llm.generate(systemPrompt, [{ role: "user", content: userPrompt }]);
        const proposal = response.message || response.thought || response.raw;

        // Save to file
        const sopsDir = join(process.cwd(), "sops", "framework_integration");
        const filePath = join(sopsDir, "optimized_patterns.md");
        await writeFile(filePath, proposal);

        // Store proposal in Brain
        await brain.callTool({
            name: "brain_store",
            arguments: {
                taskId: `optimization-proposal-${Date.now()}`,
                request: `Optimize framework integration based on ${outcomes.length} outcomes.`,
                solution: proposal,
                type: "framework_optimization_proposal",
                company: "internal"
            }
        });

        // Try to stop brain server if we started it?
        // No, keep it running as we might be in a session.
        // But if this is a ephemeral tool call, maybe stop it?
        // Let's rely on process exit if standalone, or kept alive if part of larger system.

        return {
            content: [{ type: "text", text: `Optimization proposal generated and saved to ${filePath}.` }]
        };

    } catch (e: any) {
        return { content: [{ type: "text", text: `Optimization analysis failed: ${e.message}` }], isError: true };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Framework Optimizer MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new FrameworkOptimizerServer();
  server.run().catch((err) => {
    console.error("Fatal error in Framework Optimizer:", err);
    process.exit(1);
  });
}
