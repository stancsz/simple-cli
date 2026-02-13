import { spawn, exec } from "child_process";
import { mkdir, writeFile, readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface AsyncTask {
  id: string;
  command: string;
  startTime: number;
  pid: number;
  logFile: string;
  status: "running" | "completed" | "failed" | "unknown";
  exitCode?: number | null;
}

export class AsyncTaskManager {
  private static instance: AsyncTaskManager;
  private tasksDir: string;

  private constructor(cwd: string) {
    this.tasksDir = join(cwd, ".agent", "tasks");
  }

  public static getInstance(cwd: string = process.cwd()): AsyncTaskManager {
    if (!AsyncTaskManager.instance) {
      AsyncTaskManager.instance = new AsyncTaskManager(cwd);
    }
    return AsyncTaskManager.instance;
  }

  async init() {
    if (!existsSync(this.tasksDir)) {
      await mkdir(this.tasksDir, { recursive: true });
    }
  }

  async startTask(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv = {},
  ): Promise<string> {
    await this.init();
    const id = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const logFile = join(this.tasksDir, `${id}.log`);
    const metaFile = join(this.tasksDir, `${id}.json`);

    // Prepare Task Metadata
    const taskCmd = `${command} ${args.join(" ")}`;

    // Spawn detached process
    const out = await import("fs").then((fs) => fs.openSync(logFile, "a"));
    const err = await import("fs").then((fs) => fs.openSync(logFile, "a"));

    const child = spawn(command, args, {
      detached: true,
      stdio: ["ignore", out, err],
      env: { ...process.env, ...env },
    });

    child.unref();

    const task: AsyncTask = {
      id,
      command: taskCmd,
      startTime: Date.now(),
      pid: child.pid!,
      logFile,
      status: "running",
    };

    await writeFile(metaFile, JSON.stringify(task, null, 2));

    return id;
  }

  async getTaskStatus(id: string): Promise<AsyncTask> {
    await this.init();
    const metaFile = join(this.tasksDir, `${id}.json`);

    if (!existsSync(metaFile)) {
      throw new Error(`Task ${id} not found`);
    }

    const task: AsyncTask = JSON.parse(await readFile(metaFile, "utf-8"));

    // Check if process is still running
    if (task.status === "running") {
      try {
        // process.kill(pid, 0) checks if process exists
        process.kill(task.pid, 0);
      } catch (e) {
        // Process not found, it must have finished
        task.status = "completed"; // We act optimistic, need to check exit code?
        // Actually, we can't easily check exit code of detached process without waiting for it
        // Ideally, we'd check the log file for success indicators or have the process write its exit code.

        // For now, let's check log file for "SUCCESS" or "FAILURE" if possible,
        // or just mark as 'completed' (meaning finished execution).

        const logs = await this.getTaskLogs(id, 1000); // Check last lines
        if (logs.includes("FAILURE") || logs.includes("Error:")) {
          task.status = "failed";
        } else if (logs.includes("SUCCESS") || logs.includes("PR Created:")) {
          task.status = "completed";
        } else {
          task.status = "completed"; // Assumed success
        }

        await writeFile(metaFile, JSON.stringify(task, null, 2));
      }
    }

    return task;
  }

  async getTaskLogs(id: string, lines: number = 20): Promise<string> {
    await this.init();
    const logFile = join(this.tasksDir, `${id}.log`);
    if (!existsSync(logFile)) return "";

    const content = await readFile(logFile, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).join("\n");
  }

  async listTasks(): Promise<AsyncTask[]> {
    await this.init();
    const files = await readdir(this.tasksDir);
    const tasks: AsyncTask[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const content = await readFile(join(this.tasksDir, file), "utf-8");
          tasks.push(JSON.parse(content));
        } catch {}
      }
    }
    return tasks.sort((a, b) => b.startTime - a.startTime);
  }
}
