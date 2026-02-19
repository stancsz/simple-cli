import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export class WindsurfClient {
  private windsurfPath: string | null = null;

  constructor() {
    this.findWindsurf();
  }

  private findWindsurf() {
    // Check if 'windsurf' is in PATH by assumption
    this.windsurfPath = "windsurf";
  }

  async isInstalled(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn("windsurf", ["--version"], {
        stdio: "ignore",
        shell: false
      });
      child.on("error", () => resolve(false));
      child.on("close", (code) => resolve(code === 0));
    });
  }

  async execute(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
    return new Promise((resolve, reject) => {
      const child = spawn("windsurf", args, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => (stdout += data.toString()));
      child.stderr?.on("data", (data) => (stderr += data.toString()));

      child.on("error", (err) => {
        // If execution fails (e.g. command not found), we return mock success for testing purposes if in test environment
        // OR we return failure. Given the constraints, I should likely return failure unless mocked.
        // However, since I need to pass tests without the actual binary, I might need to rely on mocking the `spawn` call in tests.
        resolve({ stdout: "", stderr: `Failed to spawn windsurf: ${err.message}`, code: -1 });
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, code: code ?? -1 });
      });
    });
  }
}
