import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, open } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

const AGENT_DIR = join(process.cwd(), '.agent');
const STATE_FILE = join(AGENT_DIR, 'daemon_state.json');
const LOG_FILE = join(AGENT_DIR, 'logs', 'daemon.log');

const server = new McpServer({
  name: "daemon-health",
  version: "1.0.0"
});

server.tool(
  "get_daemon_status",
  "Retrieve the current status of the Daemon and Scheduler.",
  {},
  async () => {
    try {
      if (!existsSync(STATE_FILE)) {
        return {
          content: [{ type: "text", text: "Daemon state file not found. Daemon might not be running." }]
        };
      }
      const content = await readFile(STATE_FILE, "utf-8");
      // Validate JSON
      try {
          const state = JSON.parse(content);
          return {
            content: [{ type: "text", text: JSON.stringify(state, null, 2) }]
          };
      } catch (e) {
          return {
              content: [{ type: "text", text: "Daemon state file is corrupted." }]
          };
      }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error reading status: ${error.message}` }]
      };
    }
  }
);

server.tool(
  "view_daemon_logs",
  "View the last N lines of the daemon log file.",
  {
    lines: z.number().optional().default(20).describe("Number of last lines to read")
  },
  async ({ lines }) => {
    try {
      if (!existsSync(LOG_FILE)) {
        return {
          content: [{ type: "text", text: "Daemon log file not found." }]
        };
      }

      // Efficiently read last N lines
      const fileHandle = await open(LOG_FILE, 'r');
      const stat = await fileHandle.stat();
      const fileSize = stat.size;
      const bufferSize = 1024 * 10; // 10KB chunks
      const buffer = Buffer.alloc(bufferSize);

      let logs = "";
      let position = fileSize;
      let lineCount = 0;

      while (position > 0 && lineCount < lines) {
          const readSize = Math.min(position, bufferSize);
          position -= readSize;

          await fileHandle.read(buffer, 0, readSize, position);
          const chunk = buffer.toString('utf-8', 0, readSize);
          logs = chunk + logs;

          lineCount = logs.split('\n').length - 1; // Approx
      }

      await fileHandle.close();

      // Trim to exact lines
      const allLines = logs.split('\n');
      const lastLines = allLines.slice(-lines).join('\n');

      return {
        content: [{ type: "text", text: lastLines }]
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error reading logs: ${error.message}` }]
      };
    }
  }
);

server.tool(
  "restart_scheduler",
  "Force restart the Scheduler component by killing its process.",
  {
      reason: z.string().optional().describe("Reason for restart (for logging)")
  },
  async ({ reason }) => {
    try {
        if (!existsSync(STATE_FILE)) {
            return {
                content: [{ type: "text", text: "Daemon state file not found." }]
            };
        }

        const content = await readFile(STATE_FILE, "utf-8");
        const state = JSON.parse(content);

        if (state.schedulerPid) {
            try {
                process.kill(state.schedulerPid, 'SIGTERM');
                return {
                    content: [{ type: "text", text: `Sent SIGTERM to Scheduler (PID: ${state.schedulerPid}). Daemon should restart it shortly.` }]
                };
            } catch (e: any) {
                 return {
                    content: [{ type: "text", text: `Failed to kill Scheduler process: ${e.message}. It might have already exited.` }]
                };
            }
        } else {
             return {
                content: [{ type: "text", text: "Scheduler PID not found in state. It might be stopped or crashing." }]
            };
        }
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error restarting scheduler: ${error.message}` }]
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
