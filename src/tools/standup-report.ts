import { z } from "zod";
import { createLLM } from "../llm.js";
import { EpisodicMemory, PastEpisode } from "../brain/episodic.js";
import { join } from "path";
import { writeFile, mkdir } from "fs/promises";
import { postToSlack } from "../interfaces/slack.js";

const REPORT_PROMPT = `
You are generating a Morning Standup report for an autonomous AI agent (Ghost Mode).
Summarize the following work completed in the last 12 hours into a concise, human-readable report.
Adopt the persona's voice (if any).
Focus on what was achieved, any issues encountered, and key changes.

Structure it as:
## Morning Standup ☕
**Summary**: High-level overview.
**Completed Tasks**: Bullet points of key tasks.
**Issues/Blockers**: Any failures or errors.

Work Log:
`;

export const standup_report = {
  name: "standup_report",
  description: "Generate a daily standup report summarizing autonomous work from the last 12 hours.",
  inputSchema: z.object({
    channel: z.string().optional().describe("The Slack channel to post the report to (e.g., '#general'). Defaults to process.env.SLACK_CHANNEL."),
  }),
  execute: async ({ channel }: { channel?: string }) => {
    try {
      const llm = createLLM();
      // Use process.cwd() as baseDir for EpisodicMemory
      const memory = new EpisodicMemory(process.cwd(), llm);

      // 12 hours ago
      const minTimestamp = Date.now() - 12 * 60 * 60 * 1000;

      // Recall memories with 'autonomous' tag
      // We use a generic query to get relevant items, filtered by timestamp and tag
      // Ideally we want *all* items, but recall is search-based.
      // Setting limit high to capture most recent tasks.
      const memories = await memory.recall("", 50, {
          tags: ['autonomous'],
          minTimestamp
      });

      if (memories.length === 0) {
          const noWorkMsg = "No autonomous tasks found in the last 12 hours.";
          // Still generate a report file saying no work was done
          const date = new Date().toISOString().split('T')[0];
          const reportPath = join(process.cwd(), '.agent', 'standups', `${date}.md`);
          await mkdir(join(process.cwd(), '.agent', 'standups'), { recursive: true });
          await writeFile(reportPath, `## Morning Standup ☕\n\n${noWorkMsg}`);
          return noWorkMsg;
      }

      // Format context for LLM
      const context = memories.map((m: PastEpisode) =>
          `- Task: ${m.taskId}\n  Goal: ${m.userPrompt}\n  Result: ${m.agentResponse}\n  Time: ${new Date(m.timestamp).toLocaleString()}`
      ).join("\n\n");

      const prompt = `${REPORT_PROMPT}\n${context}`;

      // Generate report
      const response = await llm.generate(prompt, [], new AbortController().signal);
      const report = response.message || "Failed to generate report.";

      // Save to file
      const date = new Date().toISOString().split('T')[0];
      const reportPath = join(process.cwd(), '.agent', 'standups', `${date}.md`);
      await mkdir(join(process.cwd(), '.agent', 'standups'), { recursive: true });
      await writeFile(reportPath, report);

      // Post to Slack if configured
      const targetChannel = channel || process.env.SLACK_CHANNEL;
      if (targetChannel) {
          try {
              await postToSlack(report, targetChannel);
              return `Report generated and posted to ${targetChannel}. Saved to ${reportPath}.`;
          } catch (e: any) {
              return `Report generated and saved to ${reportPath}, but failed to post to Slack: ${e.message}`;
          }
      }

      return `Report generated and saved to ${reportPath}.`;
    } catch (e: any) {
      return `Error generating standup report: ${e.message}`;
    }
  },
};
