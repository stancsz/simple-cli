import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { fileURLToPath } from "url";
import { join } from "path";
import { readFile, readdir, open } from "fs/promises";
import { existsSync, statSync } from "fs";
import { randomUUID } from "crypto";

import { createLLM, LLMResponse } from "../../llm/index.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { ProposalManager } from "./proposal_manager.js";
import { analyzePerformancePrompt } from "./prompts.js";
import { Proposal, LogEntry } from "./types.js";
import { analyzeCrossSwarmPatterns } from "./tools/pattern_analysis.js";
import { generateSOPFromPatterns } from "./tools/sop_generation.js";

export class HRServer {
  private server: McpServer;
  private memory: EpisodicMemory;
  private manager: ProposalManager;
  private llm: ReturnType<typeof createLLM>;
  private sopLogsPath: string;
  private logsDir: string;

  constructor() {
    this.server = new McpServer({
      name: "hr_loop",
      version: "1.0.0",
    });

    this.memory = new EpisodicMemory();
    this.manager = new ProposalManager();
    this.llm = createLLM();
    this.sopLogsPath = join(process.cwd(), ".agent", "brain", "sop_logs.json");
    this.logsDir = join(process.cwd(), "logs");

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

    this.server.tool(
      "analyze_cross_swarm_patterns",
      "Analyze execution logs and memory to find success patterns and failure modes across swarms.",
      {
        agent_type: z.string().optional().describe("Filter by agent type (e.g., 'planner', 'coder')."),
        swarm_id: z.string().optional().describe("Filter by specific swarm ID."),
        limit: z.number().optional().default(20).describe("Number of episodes to analyze."),
      },
      async (args) => analyzeCrossSwarmPatterns(this.memory, this.llm, args)
    );

    this.server.tool(
      "generate_sop_from_patterns",
      "Generate a new Standard Operating Procedure (SOP) based on pattern analysis.",
      {
        pattern_analysis: z.string().describe("The analysis text containing patterns and recommendations."),
        title: z.string().describe("The title of the new SOP."),
        filename: z.string().optional().describe("Optional filename (relative to sops/). Defaults to auto-generated."),
      },
      async (args) => generateSOPFromPatterns(this.llm, args)
    );
  }

  public async performWeeklyReview() {
    // Analyze last 50 logs for a broader weekly context
    return this.performAnalysis(50);
  }

  private async performAnalysis(limit: number) {
    // 1. Read SOP logs
    let logs: LogEntry[] = [];
    if (existsSync(this.sopLogsPath)) {
      try {
        const content = await readFile(this.sopLogsPath, "utf-8");
        logs = JSON.parse(content);
      } catch (e) {
        console.error("Error reading SOP logs:", e);
      }
    }

    // 2. Read General Logs from logs/
    let generalLogs: string[] = [];
    if (existsSync(this.logsDir)) {
      try {
        const files = await readdir(this.logsDir);
        for (const file of files) {
          const filePath = join(this.logsDir, file);
          const stats = statSync(filePath);
          if (stats.isFile()) {
             // Read last 4KB to avoid reading huge files
             let content = "";
             try {
                 const handle = await open(filePath, 'r');
                 const size = stats.size;
                 const bufferSize = Math.min(4096, size);
                 const buffer = Buffer.alloc(bufferSize);
                 await handle.read(buffer, 0, bufferSize, Math.max(0, size - bufferSize));
                 await handle.close();
                 content = buffer.toString('utf-8');
             } catch (e) {
                 console.error(`Failed to read tail of ${file}:`, e);
                 continue;
             }

             // Heuristic: if JSON, try to parse arrays
             if (file.endsWith('.json')) {
                 try {
                     const parsed = JSON.parse(content);
                     if (Array.isArray(parsed)) {
                        // If it matches LogEntry structure, add to logs, else add as string
                        parsed.forEach(p => {
                            if (p.sop && p.result) logs.push(p);
                            else generalLogs.push(`[${file}] ${JSON.stringify(p)}`);
                        });
                     } else {
                        generalLogs.push(`[${file}] ${JSON.stringify(parsed)}`);
                     }
                 } catch {
                     generalLogs.push(`[${file}] (Invalid JSON) ${content.slice(-1000)}`);
                 }
             } else {
                 // Plain text log
                 const lines = content.split('\n').slice(-20); // Last 20 lines
                 generalLogs.push(`[${file}] ...\n${lines.join('\n')}`);
             }
          }
        }
      } catch (e) {
        console.error("Error reading logs dir:", e);
      }
    }

    if (logs.length === 0 && generalLogs.length === 0) {
      return { content: [{ type: "text" as const, text: "No logs found to analyze." }] };
    }

    // Take recent SOP logs
    const recentLogs = logs.slice(-limit);
    const sopLogSummary = recentLogs.map((l: any) => {
      if (l.result) {
        const status = l.result.success ? "SUCCESS" : "FAILURE";
        const steps = l.result.logs.map((s: any) => `  - [${s.status}] ${s.step}: ${s.output}`).join("\n");
        return `[${l.timestamp}] SOP: ${l.sop} -> ${status}\n${steps}`;
      } else {
        return `[${l.timestamp}] SOP: ${l.sop} Step ${l.step}: ${String(l.status).toUpperCase()} - ${l.details}`;
      }
    }).join("\n\n");

    const generalLogSummary = generalLogs.join("\n\n");
    const fullLogSummary = `SOP LOGS:\n${sopLogSummary}\n\nGENERAL LOGS:\n${generalLogSummary}`;

    // 2. Query Memory for context (e.g. recent failures)
    // We search for "failure" or "error" if any logs failed
    const hasFailures = recentLogs.some((l: any) => {
      if (l.result) return !l.result.success;
      return l.status !== 'success';
    }) || generalLogSummary.toLowerCase().includes("error");

    let pastExperiences = "No specific past experiences queried.";

    if (hasFailures) {
      const results = await this.memory.recall("failure error bug", 5);
      if (results.length > 0) {
        pastExperiences = results.map(r => `[Task: ${r.taskId}] ${r.userPrompt} -> ${r.agentResponse}`).join("\n---\n");
      }
    }

    // 3. LLM Analysis
    const prompt = analyzePerformancePrompt(fullLogSummary, pastExperiences);
    const response = await this.llm.generate(prompt, []);

    // Parse JSON from response
    let analysisData: any;
    try {
      // Attempt to parse JSON from the response text (handling potential markdown blocks)
      const rawMsg = response.message || response.raw;
      const jsonMatch = rawMsg.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (e) {
      return {
        content: [{ type: "text" as const, text: `Failed to parse analysis from LLM.\nResponse: ${response.message}` }],
        isError: true
      };
    }

    if (analysisData.improvement_needed) {
      // CHECK IF CORE UPDATE
      const isCoreUpdate = analysisData.affected_files?.some((f: string) => f.startsWith("src/"));

      if (isCoreUpdate) {
        return {
          content: [{
            type: "text" as const,
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

      await this.manager.init();
      await this.manager.add(proposal);

      return {
        content: [{ type: "text" as const, text: `Analysis Complete. Proposal Created: ${proposal.id}\nTitle: ${proposal.title}\nAnalysis: ${analysisData.analysis}` }]
      };
    }

    return {
      content: [{ type: "text" as const, text: `Analysis Complete. No improvements suggested.\nAnalysis: ${analysisData.analysis}` }]
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
        content: [{ type: "text" as const, text: `Error: Changes to 'src/' files must use 'propose_core_update' tool for safety verification.` }],
        isError: true
      };
    }

    await this.manager.init();

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

    await this.manager.add(proposal);
    return {
      content: [{ type: "text" as const, text: `Proposal '${title}' created with ID: ${proposal.id}` }]
    };
  }

  public async listPendingProposals() {
    await this.manager.init();
    const pending = await this.manager.getPending();

    if (pending.length === 0) {
      return { content: [{ type: "text" as const, text: "No pending proposals." }] };
    }

    const text = pending.map(p =>
      `ID: ${p.id}\nTitle: ${p.title}\nDescription: ${p.description}\nFiles: ${p.affectedFiles.join(", ")}\nStatus: ${p.status}\n---`
    ).join("\n");

    return { content: [{ type: "text" as const, text }] };
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
