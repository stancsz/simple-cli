import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { createLLM } from "../../llm.js";
import { jsonrepair } from "jsonrepair";
import { analyzePerformancePrompt } from "../../hr/prompts.js";

interface LogEntry {
  taskId: string;
  taskName: string;
  startTime: number;
  endTime: number;
  status: string;
  errorMessage?: string;
  history: any[];
}

const LOGS_DIR = join(process.cwd(), ".agent", "logs");

export async function scanLogs(days: number = 7): Promise<LogEntry[]> {
  if (!existsSync(LOGS_DIR)) return [];

  const files = await readdir(LOGS_DIR);
  const now = Date.now();
  const limit = days * 24 * 60 * 60 * 1000;
  const logs: LogEntry[] = [];

  // Sort files by name (timestamp) descending to get newest first
  files.sort().reverse();

  // Limit to last 100 logs to avoid OOM/timeout
  const recentFiles = files.slice(0, 100);

  for (const file of recentFiles) {
    if (!file.endsWith(".json")) continue;

    try {
      const content = await readFile(join(LOGS_DIR, file), "utf-8");
      const log: LogEntry = JSON.parse(content);

      if (now - log.startTime < limit) {
        logs.push(log);
      }
    } catch (e) {
      console.error(`Failed to parse log ${file}:`, e);
    }
  }

  return logs;
}

export async function analyzeAgent(agentName: string, days: number = 7): Promise<string> {
  console.log(`Analyzing single agent: ${agentName} for last ${days} days.`);
  const logs = await scanLogs(days);
  const agentLogs = logs.filter(l => l.taskName === agentName);

  if (agentLogs.length === 0) {
      return `No logs found for agent ${agentName} in last ${days} days.`;
  }

  // Only analyze if there are failures or mixed results
  const failures = agentLogs.filter(l => l.status !== "success");
  if (failures.length === 0 && agentLogs.length < 5) {
      return `Agent ${agentName} has a perfect record (but few runs). No optimization needed yet.`;
  }

  console.log(`Analyzing agent: ${agentName} (${agentLogs.length} logs, ${failures.length} failures)`);

  // Prepare prompt
  const recentLogs = agentLogs.slice(-5); // Analyze last 5 runs
  const logSummaries = recentLogs.map(l => JSON.stringify({
      status: l.status,
      error: l.errorMessage,
      // Summarize history to save tokens: just last few steps
      last_steps: l.history && Array.isArray(l.history) ? l.history.slice(-3) : []
  })).join("\n---\n");

  const llm = createLLM();
  const prompt = analyzePerformancePrompt(agentName, logSummaries);

  try {
      // Add a dummy user message because some LLM providers fail with empty messages
      const response = await llm.generate(prompt, [{ role: "user", content: "Please analyze the logs." }]);
      const raw = response.raw || response.message || "";

      // Robust JSON parsing
      let result: any;
      try {
          const jsonPart = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
          const repaired = jsonrepair(jsonPart);
          result = JSON.parse(repaired);
      } catch (e) {
          console.error("Failed to parse analysis JSON:", e);
          return `Failed to parse analysis from LLM for ${agentName}. Raw response: ${raw}`;
      }

      if (result && result.improvement_needed && result.suggested_instructions) {
          return JSON.stringify(result, null, 2);
      } else {
          return `No improvements needed for ${agentName}. Analysis: ${result.analysis || "None"}`;
      }

  } catch (e: any) {
      console.error(`Error analyzing agent ${agentName}:`, e);
      return `Error analyzing agent ${agentName}: ${e.message}`;
  }
}
