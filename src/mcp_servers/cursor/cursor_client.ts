import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export class CursorClient {
  private cursorPath: string | null = null;

  constructor() {
    this.findCursor();
  }

  private findCursor() {
    // Check if 'cursor' is in PATH by running it
    // Or check common locations if needed.
    // For now, assume it's in PATH or we can't run it.
    // We can't easily check PATH in node without `which` or trying to run it.
    // So we'll just try to run it on demand.
    this.cursorPath = "cursor";
  }

  async isInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn("cursor", ["--version"], {
        stdio: "ignore",
        shell: false
      });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }

  async execute(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn("cursor", args, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => (stdout += data.toString()));
      child.stderr?.on("data", (data) => (stderr += data.toString()));

      child.on("error", (err) => {
        // If execution fails (e.g. command not found), we consider it an error
        resolve({ stdout: "", stderr: `Failed to spawn cursor: ${err.message}`, code: -1 });
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? -1 });
      });
    });
  }
}
