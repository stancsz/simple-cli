import { readFile, writeFile, readdir, mkdir } from "fs/promises";
import { join, basename } from "path";
import { existsSync } from "fs";
import { createLLM } from "../llm.js";
import { jsonrepair } from "jsonrepair";
import { analyzePerformancePrompt, updateSoulPrompt } from "../hr/prompts.js";

interface LogEntry {
  taskId: string;
  taskName: string;
  startTime: number;
  endTime: number;
  status: string;
  errorMessage?: string;
  history: any[];
}

interface SkillStats {
  success: number;
  failure: number;
  lastRun: number;
  averageDuration: number;
}

interface SkillsGraph {
  [agentName: string]: SkillStats;
}

const LOGS_DIR = join(process.cwd(), ".agent", "logs");
const SOULS_DIR = join(process.cwd(), "src", "agents", "souls");
const SKILLS_FILE = join(process.cwd(), ".agent", "skills.json");

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

export async function updateSkillsGraph(logs: LogEntry[]) {
  let skills: SkillsGraph = {};
  if (existsSync(SKILLS_FILE)) {
    try {
      skills = JSON.parse(await readFile(SKILLS_FILE, "utf-8"));
    } catch (e) {
      console.error("Failed to parse skills.json, starting fresh.");
    }
  }

  skills = {};
  for (const log of logs) {
      if (!skills[log.taskName]) {
          skills[log.taskName] = { success: 0, failure: 0, lastRun: 0, averageDuration: 0 };
      }
      const s = skills[log.taskName];
      if (log.status === "success") s.success++;
      else s.failure++;

      const duration = log.endTime - log.startTime;
      const totalRuns = s.success + s.failure;

      // Moving average
      s.averageDuration = s.averageDuration === 0
          ? duration
          : ((s.averageDuration * (totalRuns - 1)) + duration) / totalRuns;

      if (log.startTime > s.lastRun) s.lastRun = log.startTime;
  }

  await writeFile(SKILLS_FILE, JSON.stringify(skills, null, 2));
  console.log("Updated skills graph.");
}

export async function analyzeAndOptimize(logs: LogEntry[]) {
  const llm = createLLM();
  const logsByAgent: Record<string, LogEntry[]> = {};

  for (const log of logs) {
    if (!logsByAgent[log.taskName]) logsByAgent[log.taskName] = [];
    logsByAgent[log.taskName].push(log);
  }

  for (const [agentName, agentLogs] of Object.entries(logsByAgent)) {
    // Only analyze if there are failures or mixed results
    const failures = agentLogs.filter(l => l.status !== "success");
    if (failures.length === 0 && agentLogs.length < 5) {
        console.log(`Agent ${agentName} has perfect record (but few runs). Skipping optimization.`);
        continue;
    }

    console.log(`Analyzing agent: ${agentName} (${agentLogs.length} logs, ${failures.length} failures)`);

    // Prepare prompt
    const recentLogs = agentLogs.slice(-5); // Analyze last 5 runs
    const logSummaries = recentLogs.map(l => JSON.stringify({
        status: l.status,
        error: l.errorMessage,
        // Summarize history to save tokens: just last few steps
        last_steps: l.history.slice(-3)
    })).join("\n---\n");

    const prompt = analyzePerformancePrompt(agentName, logSummaries);

    try {
        const response = await llm.generate(prompt, []);
        const raw = response.raw || response.message || "";

        // Robust JSON parsing
        let result: any;
        try {
            const jsonPart = raw.match(/\{[\s\S]*\}/)?.[0] || raw;
            const repaired = jsonrepair(jsonPart);
            result = JSON.parse(repaired);
        } catch (e) {
            console.error("Failed to parse analysis JSON:", e);
            continue;
        }

        if (result && result.improvement_needed && result.suggested_instructions) {
            console.log(`Optimizing Soul for ${agentName}...`);
            await updateSoul(agentName, result.suggested_instructions, result.analysis);
        } else {
            console.log(`No improvements needed for ${agentName}.`);
        }

    } catch (e) {
        console.error(`Error analyzing agent ${agentName}:`, e);
    }
  }
}

export async function analyzeAgent(agentName: string, days: number = 7) {
  console.log(`Analyzing single agent: ${agentName} for last ${days} days.`);
  const logs = await scanLogs(days);
  const agentLogs = logs.filter(l => l.taskName === agentName);

  if (agentLogs.length === 0) {
      console.log(`No logs found for agent ${agentName} in last ${days} days.`);
      return `No logs found for agent ${agentName}.`;
  }

  await analyzeAndOptimize(agentLogs);
  return `Analysis completed for ${agentName}.`;
}

export async function updateSoul(agentName: string, newInstructions: string, analysis: string) {
    if (!existsSync(SOULS_DIR)) {
        await mkdir(SOULS_DIR, { recursive: true });
    }

    const soulPath = join(SOULS_DIR, `${agentName}.md`);
    let currentSoul = "";

    if (existsSync(soulPath)) {
        currentSoul = await readFile(soulPath, "utf-8");
    } else {
        currentSoul = `# ${agentName} Soul\n\nNo previous instructions.`;
    }

    const llm = createLLM();
    const prompt = updateSoulPrompt(agentName, currentSoul, analysis, newInstructions);

    const response = await llm.generate(prompt, []);
    const newSoulContent = response.message || response.raw;

    if (newSoulContent && newSoulContent.length > 10) {
        await writeFile(soulPath, newSoulContent);
        console.log(`Updated soul for ${agentName}`);
    }
}

export async function runHRLoop() {
  console.log("Starting HR Optimization Loop...");
  const logs = await scanLogs(7);
  console.log(`Found ${logs.length} logs in the last 7 days.`);

  await updateSkillsGraph(logs);
  await analyzeAndOptimize(logs);

  console.log("HR Loop Completed.");
  return "HR Loop Completed Successfully.";
}

// Allow running directly
if (process.argv[1] === import.meta.url || process.argv[1].endsWith('hr_loop.ts')) {
    runHRLoop().catch(console.error);
}
