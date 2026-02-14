import { spawn, execFile, ChildProcess } from "child_process";
import { promisify } from "util";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

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

// --- Meta-Orchestrator Tools ---
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

      const agent = config.agents[cli];
      const cmdArgs = [...(agent.args || []), task];

      // Handle file arguments for agents that don't support stdin or use --file flags
      if (!agent.supports_stdin && context_files && context_files.length > 0) {
        for (const file of context_files) {
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
      if (agent.supports_stdin && context_files && context_files.length > 0) {
        let context = "";
        for (const file of context_files) {
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

export const allBuiltins = [
  delegate_cli,
  change_dir,
];
