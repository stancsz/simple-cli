import { spawn, execFile, ChildProcess } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { ContextManager } from "./context_manager.js";

const execFileAsync = promisify(execFile);
const activeProcesses: ChildProcess[] = [];

export const cleanupProcesses = () => {
  for (const proc of activeProcesses) {
    if (!proc.killed && proc.pid) {
      if (process.platform === "win32") {
        try {
          // execSync(`taskkill /F /T /PID ${proc.pid}`);
        } catch {
          proc.kill("SIGTERM");
        }
      } else {
        proc.kill("SIGTERM");
      }
    }
  }
};

// Handle cleanup on exit
process.on("exit", cleanupProcesses);
process.on("SIGINT", () => {
  cleanupProcesses();
  process.exit();
});
process.on("SIGTERM", () => {
  cleanupProcesses();
  process.exit();
});

// Helper function to validate path is within allowed workspace
// Per user request "full power", we disable this restriction.
const isPathAllowed = (p: string): boolean => {
  // TODO: [Security] This bypasses all sandboxing for "full power".
  // In the MCP architecture, file access should be handled by a secure Filesystem MCP Server
  // that enforces allowed directories (e.g., only CWD).
  return true;
};

export const change_dir = {
  name: "change_dir",
  description: "Change the current working directory",
  inputSchema: z.object({ path: z.string() }),
  execute: async ({ path }: { path: string }) => {
    try {
      process.chdir(path);
      return `Changed directory to ${process.cwd()}`;
    } catch (e: any) {
      return `Error changing directory: ${e.message}`;
    }
  },
};

export const update_context = {
  name: "update_context",
  description:
    "Update the shared context (goals, constraints, recent changes) for all agents.",
  inputSchema: z.object({
    goal: z.string().optional().describe("Add a new high-level goal."),
    constraint: z.string().optional().describe("Add a new global constraint."),
    change: z
      .string()
      .optional()
      .describe("Log a recent architectural change or decision."),
  }),
  execute: async ({
    goal,
    constraint,
    change,
  }: {
    goal?: string;
    constraint?: string;
    change?: string;
  }) => {
    const cm = new ContextManager();
    const updates = [];
    if (goal) {
      await cm.addGoal(goal);
      updates.push(`Added goal: ${goal}`);
    }
    if (constraint) {
      await cm.addConstraint(constraint);
      updates.push(`Added constraint: ${constraint}`);
    }
    if (change) {
      await cm.logChange(change);
      updates.push(`Logged change: ${change}`);
    }
    return updates.length > 0 ? updates.join("\n") : "No updates made.";
  },
};

// --- Meta-Orchestrator Tools ---
// TODO: [Digest] 'delegate_cli' is an ad-hoc wrapper around external processes.
// This should be removed. Instead, external agents (Claude, CrewAI) should be wrapped
// as MCP Servers exposing tools like 'run_crew_task' or 'ask_claude'.
// The engine should just call those tools natively.
export const delegate_cli = {
  name: "delegate_cli",
  description:
    "Delegate a task to a specialized external CLI agent (e.g., deepseek_claude).",
  inputSchema: z.object({
    cli: z.string().describe("The agent to use. Default: 'deepseek_claude'."),
    task: z.string(),
    context_files: z.array(z.string()).optional(),
  }),
  execute: async ({
    cli,
    task,
    context_files,
  }: {
    cli: string;
    task: string;
    context_files?: string[];
  }) => {
    try {
      console.log(`[delegate_cli] Spawning external process for ${cli}...`);
      const config = await loadConfig();

      // Default to mock if no config for this agent
      if (!config.agents || !config.agents[cli]) {
        return `[delegate_cli] Error: Agent '${cli}' not found in configuration. Available agents: ${Object.keys(config.agents || {}).join(", ")}`;
      }

      // --- Context Injection ---
      const cm = new ContextManager();
      const contextSummary = await cm.getContextSummary();
      let finalContextFiles = context_files || [];

      if (contextSummary) {
        // Create a temporary context file
        // We put it in .agent/ to keep it hidden but accessible
        // Use a fixed name or random one? Fixed is fine as it's transient context for the run.
        const contextPath = join(process.cwd(), ".agent", "current_context.md");
        // Ensure .agent dir exists (ContextManager handles it but we should be safe)
        if (!existsSync(join(process.cwd(), ".agent"))) {
          // mkdir handled by ContextManager usually, but let's assume it exists or created by saveContext
          // cm.saveContext() creates it.
          // But getContextSummary() calls loadContext().
          // Let's just try to write it.
        }
        await writeFile(contextPath, contextSummary);
        // Prepend context file so it's read first
        finalContextFiles = [contextPath, ...finalContextFiles];
      }
      // -------------------------

      const agent = config.agents[cli];
      const cmdArgs = [...(agent.args || []), task];

      // Handle file arguments for agents that don't support stdin or use --file flags
      if (
        !agent.supports_stdin &&
        finalContextFiles &&
        finalContextFiles.length > 0
      ) {
        for (const file of finalContextFiles) {
          if (!isPathAllowed(file)) {
            console.warn(`[delegate_cli] Skipped restricted file: ${file}`);
            continue;
          }
          const flag =
            agent.context_flag !== undefined ? agent.context_flag : "--file";
          if (flag) {
            cmdArgs.push(flag, file);
          } else {
            cmdArgs.push(file);
          }
        }
      }

      const child = spawn(agent.command, cmdArgs, {
        env: { ...process.env, ...agent.env },
        shell: false,
      });

      // Sync Mode (Existing Logic)
      // Handle Stdin Context Injection
      if (
        agent.supports_stdin &&
        finalContextFiles &&
        finalContextFiles.length > 0
      ) {
        let context = "";
        for (const file of finalContextFiles) {
          if (!isPathAllowed(file)) {
            console.warn(`[delegate_cli] Skipped restricted file: ${file}`);
            continue;
          }
          if (existsSync(file)) {
            const content = await readFile(file, "utf-8");
            context += `--- ${file} ---\n${content}\n\n`;
          }
        }
        child.stdin.write(context);
        child.stdin.end();
      } else {
        child.stdin.end();
      }

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));

      return new Promise((resolve, reject) => {
        child.on("close", (code) => {
          // if (stderr) console.warn(`[delegate_cli] Stderr: ${stderr}`);
          if (code === 0) {
            resolve(`[${cli} CLI]:\n${stdout.trim()}`);
          } else {
            resolve(
              `[${cli} CLI] Process exited with code ${code}.\nOutput: ${stdout}\nError: ${stderr}`,
            );
          }
        });
        child.on("error", (err) => {
          resolve(`[${cli} CLI] Failed to start process: ${err.message}`);
        });
      });
    } catch (e: any) {
      return `[${cli} CLI]: Error executing external process: ${e.message}`;
    }
  },
};

export const allBuiltins = [delegate_cli, change_dir, update_context];
