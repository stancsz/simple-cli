import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join } from "path";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { randomUUID } from "crypto";

import { createLLM, LLMResponse } from "../../llm.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { ProposalStorage } from "./storage.js";
import { analyzePerformancePrompt } from "./prompts.js";
import { Proposal, LogEntry } from "./types.js";

export class HRServer {
  private server: McpServer;
  private memory: EpisodicMemory;
  private storage: ProposalStorage;
  private llm: ReturnType<typeof createLLM>;
  private logsPath: string;

  constructor() {
    this.server = new McpServer({
      name: "hr_loop",
      version: "1.0.0",
    });

    this.memory = new EpisodicMemory();
    this.storage = new ProposalStorage();
    this.llm = createLLM();
    this.logsPath = join(process.cwd(), ".agent", "sop_logs.json");

    this.setupTools();
  }

  private setupTools() {
    this.server.tool(
      "analyze_logs",
      "Scans recent logs and past experiences to identify patterns and propose improvements.",
      {
        limit: z.number().optional().default(10).describe("Number of recent logs to analyze."),
      },
      async (args) => this.analyzeLogs(args)
    );

    this.server.tool(
      "propose_change",
      "Manually draft a change proposal for the agent.",
      {
        title: z.string().describe("Short title of the proposal."),
        description: z.string().describe("Detailed description of the change."),
        affectedFiles: z.array(z.string()).describe("List of files to be modified."),
        patch: z.string().describe("The content of the change (diff or instructions)."),
      },
      async (args) => this.proposeChange(args)
    );

    this.server.tool(
      "list_pending_proposals",
      "List all proposals awaiting review.",
      {},
      async () => this.listPendingProposals()
    );

    this.server.tool(
      "perform_weekly_review",
      "Performs a deep analysis of logs and experiences from the past week to identify long-term patterns.",
      {},
      async () => this.performWeeklyReview()
    );
  }

  public async performWeeklyReview() {
    // Analyze last 50 logs for a broader weekly context
    return this.performAnalysis(50);
  }

  private async performAnalysis(limit: number) {
    // 1. Read logs
    let logs: LogEntry[] = [];
    if (existsSync(this.logsPath)) {
      try {
        const content = await readFile(this.logsPath, "utf-8");
        logs = JSON.parse(content);
      } catch (e) {
        console.error("Error reading logs:", e);
      }
    }

    if (logs.length === 0) {
      return { content: [{ type: "text", text: "No logs found to analyze." }] };
    }

    // Take recent logs
    const recentLogs = logs.slice(-limit);
    const logSummary = recentLogs.map(l => {
        const status = l.result.success ? "SUCCESS" : "FAILURE";
        const steps = l.result.logs.map(s => `  - [${s.status}] ${s.step}: ${s.output}`).join("\n");
        return `[${l.timestamp}] SOP: ${l.sop} -> ${status}\n${steps}`;
    }).join("\n\n");

    // 2. Query Memory for context (e.g. recent failures)
    // We search for "failure" or "error" if any logs failed
    const hasFailures = recentLogs.some(l => !l.result.success);
    let pastExperiences = "No specific past experiences queried.";

    if (hasFailures) {
            const results = await this.memory.recall("failure error bug", 5);
            if (results.length > 0) {
                pastExperiences = results.map(r => `[Task: ${r.taskId}] ${r.userPrompt} -> ${r.agentResponse}`).join("\n---\n");
            }
    }

    // 3. LLM Analysis
    const prompt = analyzePerformancePrompt(logSummary, pastExperiences);
    const response = await this.llm.generate(prompt, []);

    // Parse JSON from response
    let analysisData: any;
    try {
        // Attempt to parse JSON from the response text (handling potential markdown blocks)
        const jsonMatch = response.message.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            analysisData = JSON.parse(jsonMatch[0]);
        } else {
            throw new Error("No JSON found in response");
        }
    } catch (e) {
        return {
            content: [{ type: "text", text: `Failed to parse analysis from LLM.\nResponse: ${response.message}` }],
            isError: true
        };
    }

    if (analysisData.improvement_needed) {
        // CHECK IF CORE UPDATE
        const isCoreUpdate = analysisData.affected_files?.some((f: string) => f.startsWith("src/"));

        if (isCoreUpdate) {
            return {
                content: [{
                    type: "text",
                    text: `Analysis Complete. CORE UPDATE REQUIRED.\nTitle: ${analysisData.title}\nAnalysis: ${analysisData.analysis}\n\nIMPORTANT: Use 'propose_core_update' tool for src/ files instead of standard proposals.\n\nProposed Changes:\n${JSON.stringify(analysisData.affected_files, null, 2)}\nPatch:\n${analysisData.patch}`
                }]
            };
        }

        // Standard Proposal for non-core files
        const proposal: Proposal = {
            id: randomUUID(),
            title: analysisData.title || "Automated Improvement Proposal",
            description: analysisData.description || analysisData.analysis,
            affectedFiles: analysisData.affected_files || [],
            patch: analysisData.patch || "",
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.storage.init();
        await this.storage.add(proposal);

        return {
            content: [{ type: "text", text: `Analysis Complete. Proposal Created: ${proposal.id}\nTitle: ${proposal.title}\nAnalysis: ${analysisData.analysis}` }]
        };
    }

    return {
        content: [{ type: "text", text: `Analysis Complete. No improvements suggested.\nAnalysis: ${analysisData.analysis}` }]
    };
  }

  public async analyzeLogs({ limit = 10 }: { limit?: number }) {
    return this.performAnalysis(limit);
  }

  public async proposeChange({ title, description, affectedFiles, patch }: { title: string, description: string, affectedFiles: string[], patch: string }) {
    // CHECK IF CORE UPDATE
    const isCoreUpdate = affectedFiles.some((f: string) => f.startsWith("src/"));
    if (isCoreUpdate) {
        return {
            content: [{ type: "text", text: `Error: Changes to 'src/' files must use 'propose_core_update' tool for safety verification.` }],
            isError: true
        };
    }

    await this.storage.init();

    const proposal: Proposal = {
        id: randomUUID(),
        title,
        description,
        affectedFiles,
        patch,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    await this.storage.add(proposal);
    return {
        content: [{ type: "text", text: `Proposal '${title}' created with ID: ${proposal.id}` }]
    };
  }

  public async listPendingProposals() {
    await this.storage.init();
    const pending = this.storage.getPending();

    if (pending.length === 0) {
        return { content: [{ type: "text", text: "No pending proposals." }] };
    }

    const text = pending.map(p =>
        `ID: ${p.id}\nTitle: ${p.title}\nDescription: ${p.description}\nFiles: ${p.affectedFiles.join(", ")}\nStatus: ${p.status}\n---`
    ).join("\n");

    return { content: [{ type: "text", text }] };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("HR Loop MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new HRServer();
  server.run().catch((err) => {
    console.error("Fatal error in HR Loop MCP Server:", err);
    process.exit(1);
  });
}
