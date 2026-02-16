import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createInterface } from "readline";
import { randomUUID } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class FastArduinoServer {
  private server: McpServer;
  private pythonProcess: ChildProcess | null = null;
  private pythonScriptPath: string;
  private pendingRequests = new Map<string, (value: any) => void>();

  constructor() {
    this.server = new McpServer({
      name: "fastmcp-arduino",
      version: "1.0.0",
    });
    this.pythonScriptPath = join(__dirname, "arduino_server.py");
    this.setupTools();
  }

  private async sendCommand(command: any): Promise<any> {
    if (!this.pythonProcess) {
      await this.startPythonProcess();
    }

    return new Promise((resolve, reject) => {
      if (!this.pythonProcess || !this.pythonProcess.stdin) {
          reject(new Error("Python process not running"));
          return;
      }

      const id = randomUUID();
      const payload = { ...command, id };

      this.pendingRequests.set(id, resolve);

      try {
          this.pythonProcess.stdin.write(JSON.stringify(payload) + "\n");
      } catch (e) {
          this.pendingRequests.delete(id);
          reject(e);
      }
    });
  }

  private async startPythonProcess() {
    this.pythonProcess = spawn("python3", [this.pythonScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.pythonProcess.stderr?.on('data', (data) => {
      console.error(`[Arduino Error] ${data}`);
    });

    this.pythonProcess.on('exit', (code) => {
        console.error(`Arduino process exited with code ${code}`);
        this.pythonProcess = null;
        // Reject all pending requests
        for (const [id, resolve] of this.pendingRequests) {
            resolve({ status: "error", message: "Process exited" });
        }
        this.pendingRequests.clear();
    });

    if (this.pythonProcess.stdout) {
        const rl = createInterface({ input: this.pythonProcess.stdout });
        rl.on('line', (line) => {
            if (!line.trim()) return;
            try {
                const response = JSON.parse(line);
                if (response.type === 'log') {
                    // console.error(`[Arduino Log] ${response.message}`);
                } else if (response.id && this.pendingRequests.has(response.id)) {
                    const resolve = this.pendingRequests.get(response.id);
                    this.pendingRequests.delete(response.id);
                    if (resolve) resolve(response);
                }
            } catch (e) {
                // Ignore invalid JSON
            }
        });
    }
  }

  private setupTools() {
    this.server.tool(
      "led_on",
      "Turn an LED on.",
      {
        pin: z.number().default(13).describe("Pin number"),
      },
      async ({ pin }) => {
        const res = await this.sendCommand({ command: "led_on", pin });
        return { content: [{ type: "text", text: res.message || JSON.stringify(res) }] };
      }
    );

    this.server.tool(
      "led_off",
      "Turn an LED off.",
      {
        pin: z.number().default(13).describe("Pin number"),
      },
      async ({ pin }) => {
        const res = await this.sendCommand({ command: "led_off", pin });
        return { content: [{ type: "text", text: res.message || JSON.stringify(res) }] };
      }
    );

    this.server.tool(
      "motor_move",
      "Move a servo motor to a specific angle.",
      {
        pin: z.number().describe("Pin number"),
        angle: z.number().describe("Angle in degrees (0-180)"),
      },
      async ({ pin, angle }) => {
        const res = await this.sendCommand({ command: "motor_move", pin, angle });
        return { content: [{ type: "text", text: res.message || JSON.stringify(res) }] };
      }
    );

    this.server.tool(
      "get_pin_status",
      "Get the status/value of a pin.",
      {
        pin: z.number().describe("Pin number"),
        mode: z.string().optional().default("digital").describe("Mode: 'digital' or 'analog'"),
      },
      async ({ pin, mode }) => {
        const res = await this.sendCommand({ command: "get_pin_status", pin, mode });
        return { content: [{ type: "text", text: `Pin ${pin} value: ${res.value}` }] };
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("FastMCP-Arduino Server running on stdio");
  }
}

const server = new FastArduinoServer();
server.run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
