import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { exec } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import pc from "picocolors";

const execAsync = promisify(exec);

export interface HealthCheckConfig {
  command?: string; // Custom health check command to run
  timeout?: number;
}

export interface ServerConfig {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  healthCheck?: HealthCheckConfig;
}

export async function validateCommand(command: string): Promise<boolean> {
  try {
    // specific check for absolute paths
    if (command.startsWith("/") || command.startsWith("./") || command.startsWith("../")) {
        return existsSync(command);
    }
    // check in PATH
    if (process.platform === "win32") {
        await execAsync(`where ${command}`);
    } else {
        await execAsync(`command -v ${command}`);
    }
    return true;
  } catch (e) {
    return false;
  }
}

export async function validateServer(config: ServerConfig): Promise<{ valid: boolean; error?: string }> {
  if (config.url) {
      // Basic URL validation
      try {
          new URL(config.url);
          return { valid: true };
      } catch {
          return { valid: false, error: `Invalid URL: ${config.url}` };
      }
  }

  if (config.command) {
      const isValid = await validateCommand(config.command);
      if (!isValid) {
          return { valid: false, error: `Command not found or not executable: ${config.command}` };
      }
      return { valid: true };
  }

  return { valid: false, error: "Server configuration missing 'command' or 'url'." };
}

export async function checkServerHealth(client: Client, config?: HealthCheckConfig): Promise<{ healthy: boolean; error?: string }> {
  try {
    const timeout = config?.timeout || 5000;

    if (config?.command) {
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                // kill process if possible, but here we just reject
                reject(new Error("Health check command timeout"));
            }, timeout);

            exec(config.command!, (error) => {
                clearTimeout(timer);
                if (error) {
                    reject(new Error(`Health check command failed: ${error.message}`));
                } else {
                    resolve();
                }
            });
        });
        return { healthy: true };
    }

    // Default health check: list tools
    const listToolsPromise = client.listTools();
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout));

    await Promise.race([listToolsPromise, timeoutPromise]);
    return { healthy: true };
  } catch (e: any) {
    return { healthy: false, error: e.message };
  }
}

export async function executeWithRetry(
  client: Client,
  toolName: string,
  args: any,
  retries: number = 3,
  delay: number = 1000
): Promise<any> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await client.callTool({ name: toolName, arguments: args });
    } catch (e: any) {
      attempt++;
      console.warn(pc.yellow(`[MCP] Tool '${toolName}' failed (attempt ${attempt}/${retries}): ${e.message}`));
      if (attempt >= retries) {
        throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, delay * Math.pow(2, attempt - 1))); // Exponential backoff
    }
  }
}

export async function diagnose(
  discoveredServers: Map<string, any>,
  clients: Map<string, Client>
): Promise<string> {
  const report: string[] = [];
  report.push("MCP Server Health Diagnosis");
  report.push("===========================");

  for (const [name, config] of discoveredServers.entries()) {
    const isRunning = clients.has(name);
    let status = isRunning ? pc.green("Running") : pc.dim("Stopped");
    let healthInfo = "";

    // Validation check
    const validation = await validateServer(config);
    if (!validation.valid) {
        status = pc.red("Config Error");
        healthInfo = ` - Error: ${validation.error}`;
    } else if (isRunning) {
        const client = clients.get(name)!;
        const health = await checkServerHealth(client, config.healthCheck);
        if (health.healthy) {
            status = pc.green("Healthy");
        } else {
            status = pc.red("Unhealthy");
            healthInfo = ` - Check Failed: ${health.error}`;
        }
    }

    report.push(`- ${pc.bold(name)}: ${status} [${config.source}]${healthInfo}`);
    if (config.command) {
        report.push(`  Command: ${config.command} ${config.args?.join(" ")}`);
    } else if (config.url) {
        report.push(`  URL: ${config.url}`);
    }
  }

  if (report.length === 2) {
      report.push("No servers discovered.");
  }

  return report.join("\n");
}
