import { z } from "zod";
import { join, basename } from "path";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

// Helper to get agent directory
const AGENT_DIR = join(process.cwd(), ".agent");
const GHOST_LOGS_DIR = join(AGENT_DIR, "ghost_logs");
const PROPOSALS_DIR = join(AGENT_DIR, "hr_proposals");
const SOULS_DIR = join(process.cwd(), "src", "agents", "souls");

// Ensure directories exist
const ensureDirs = async () => {
  if (!existsSync(PROPOSALS_DIR)) {
    await mkdir(PROPOSALS_DIR, { recursive: true });
  }
};

// Security: Sanitize agent name to prevent path traversal
const sanitizeAgentName = (name: string): string => {
  const safeName = basename(name).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeName || safeName !== name) {
    throw new Error(`Invalid agent name: ${name}`);
  }
  return safeName;
};

export const tools = [
  {
    name: "analyze_agent_logs",
    description: "Scans agent execution logs for recurring failure patterns.",
    args: {
        agent_name: z.string().describe("Name of the agent to analyze (e.g. 'aider', 'claude')."),
        timeframe_hours: z.number().optional().default(24).describe("How many hours of logs to scan (default: 24).")
    },
    execute: async ({ agent_name, timeframe_hours = 24 }: { agent_name: string, timeframe_hours?: number }) => {
      // Validate agent name (though logs scan is safer, good practice)
      try {
        sanitizeAgentName(agent_name);
      } catch (e) {
         // for logs, maybe we just want to filter. But let's be strict.
      }

      if (!existsSync(GHOST_LOGS_DIR)) {
        return { content: [{ type: "text", text: "No logs found." }] };
      }

      const files = await readdir(GHOST_LOGS_DIR);
      const now = Date.now();
      const cutoff = now - (timeframe_hours * 60 * 60 * 1000);

      let failures: any[] = [];
      let successCount = 0;

      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        // Expected format: timestamp_taskId.json
        const parts = file.split("_");
        const timestamp = parseInt(parts[0]);

        if (isNaN(timestamp) || timestamp < cutoff) continue;

        try {
          const content = await readFile(join(GHOST_LOGS_DIR, file), "utf-8");
          const log = JSON.parse(content);

          if (log.status === "failed") {
            failures.push(log);
          } else {
            successCount++;
          }
        } catch (e) {
          // ignore bad files
        }
      }

      if (failures.length === 0) {
        return { content: [{ type: "text", text: `Analyzed logs for last ${timeframe_hours} hours. Success: ${successCount}. No failures found.` }] };
      }

      const patterns: Record<string, number> = {};
      failures.forEach(f => {
        const msg = f.errorMessage || "Unknown error";
        patterns[msg] = (patterns[msg] || 0) + 1;
      });

      let report = `Analysis Report for ${agent_name} (${timeframe_hours}h):\n`;
      report += `Total Failures: ${failures.length}\n`;
      report += `Success Rate: ${Math.round(successCount / (successCount + failures.length) * 100)}%\n\n`;
      report += `Top Failure Patterns:\n`;

      Object.entries(patterns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([msg, count]) => {
          report += `- [${count} occurrences]: ${msg}\n`;
        });

      return { content: [{ type: "text", text: report }] };
    }
  },
  {
    name: "suggest_agent_improvement",
    description: "Proposes an improvement to an agent's soul (AGENT.md).",
    args: {
        agent_name: z.string().describe("The agent to improve (e.g. 'aider')."),
        title: z.string().describe("Title of the improvement."),
        description: z.string().describe("Description of the problem and solution."),
        changes: z.string().describe("The specific markdown content to add/change in AGENT.md.")
    },
    execute: async ({ agent_name, title, description, changes }: { agent_name: string, title: string, description: string, changes: string }) => {
      await ensureDirs();

      try {
        sanitizeAgentName(agent_name);
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }

      const proposalId = `prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const proposalPath = join(PROPOSALS_DIR, `${proposalId}.json`);

      const proposal = {
        id: proposalId,
        agent_name,
        title,
        description,
        changes,
        status: "pending",
        created_at: new Date().toISOString()
      };

      await writeFile(proposalPath, JSON.stringify(proposal, null, 2));

      return {
        content: [{
          type: "text",
          text: `Proposal created with ID: ${proposalId}. Waiting for approval via 'verify_approval' mechanism (e.g. GitHub comment or manual review).`
        }]
      };
    }
  },
  {
    name: "update_agent_soul",
    description: "Applies a pending improvement to an agent's soul after verification.",
    args: {
        proposal_id: z.string().describe("The ID of the proposal to apply.")
    },
    execute: async ({ proposal_id }: { proposal_id: string }) => {
      await ensureDirs();
      const proposalPath = join(PROPOSALS_DIR, `${proposal_id}.json`);
      const approvalPath = join(PROPOSALS_DIR, `${proposal_id}.approved`);

      if (!existsSync(proposalPath)) {
        return { content: [{ type: "text", text: `Error: Proposal ${proposal_id} not found.` }], isError: true };
      }

      // Safety Protocol: Check for approval
      if (!existsSync(approvalPath)) {
        return {
          content: [{
            type: "text",
            text: `Error: Proposal ${proposal_id} is not approved. Please request human review.`
          }],
          isError: true
        };
      }

      const proposal = JSON.parse(await readFile(proposalPath, "utf-8"));

      try {
        sanitizeAgentName(proposal.agent_name);
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: Security check failed. ${e.message}` }], isError: true };
      }

      const soulPath = join(SOULS_DIR, `${proposal.agent_name}.md`);

      // Check validation: Ensure soulPath is within SOULS_DIR
      if (!soulPath.startsWith(SOULS_DIR)) {
          return { content: [{ type: "text", text: "Error: Path traversal detected." }], isError: true };
      }

      // Read existing soul
      let soulContent = "";
      if (existsSync(soulPath)) {
          soulContent = await readFile(soulPath, "utf-8");
      }

      const newContent = soulContent + "\n\n" + proposal.changes;

      await writeFile(soulPath, newContent);

      // Mark as applied
      proposal.status = "applied";
      proposal.applied_at = new Date().toISOString();
      await writeFile(proposalPath, JSON.stringify(proposal, null, 2));

      return { content: [{ type: "text", text: `Successfully updated ${proposal.agent_name}.md` }] };
    }
  }
];
