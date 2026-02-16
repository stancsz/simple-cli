import { Engine, Context, Registry } from "./orchestrator.js";
import { MCP } from "../mcp.js";
import { appendFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import pc from "picocolors";

export class AutonomousOrchestrator extends Engine {
  private logPath: string;

  constructor(
    llm: any,
    registry: Registry,
    mcp: MCP,
    private options: {
      logPath: string;
      yoloMode: boolean;
    }
  ) {
    super(llm, registry, mcp);
    this.logPath = options.logPath;

    // Ensure log directory exists
    mkdir(dirname(this.logPath), { recursive: true }).catch(err => {
      console.error(`Failed to create log directory for ${this.logPath}:`, err);
    });

    // Override spinner to simple logging to avoid control characters in logs
    this.s = {
        start: (msg?: string) => this.log('info', `[Start] ${msg}`),
        stop: (msg?: string) => this.log('success', `[Done] ${msg}`),
        message: (msg?: string) => this.log('info', `[Update] ${msg}`),
    } as any;
  }

  protected async getUserInput(initialValue: string, interactive: boolean): Promise<string | undefined> {
    // In autonomous mode, we never ask for user input.
    // If the loop reaches here, it means the agent is waiting for input.
    // We treat this as the end of the session.
    this.log('info', "Agent is waiting for input. Ending session.");
    return undefined;
  }

  protected log(type: 'info' | 'success' | 'warn' | 'error', message: string) {
    // Strip ansi codes for file
    // eslint-disable-next-line no-control-regex
    const cleanMessage = message.replace(/\u001b\[\d+m/g, '');

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${type.toUpperCase()}]`;
    const consoleMsg = `${prefix} ${message}`;
    const fileLine = `${prefix} ${cleanMessage}\n`;

    // Log to console with colors
    if (type === 'info') console.log(pc.blue(consoleMsg));
    else if (type === 'success') console.log(pc.green(consoleMsg));
    else if (type === 'warn') console.log(pc.yellow(consoleMsg));
    else if (type === 'error') console.error(pc.red(consoleMsg));

    // Log to file
    // We don't await here because log is synchronous in base class.
    // We assume file system is fast enough or we accept risk of missing last log on crash.
    // Ensure directory exists first?
    // We'll rely on the caller to ensure the directory exists, or do it once.
    // But appendFile handles file creation, not directory.

    appendFile(this.logPath, fileLine).catch(err => {
        console.error(`Failed to write to log file ${this.logPath}:`, err);
    });
  }
}
