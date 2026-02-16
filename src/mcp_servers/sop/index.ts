import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";
import { readFile, readdir } from "fs/promises";
import { join, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import YAML from "yaml";

interface SopStep {
  name?: string;
  description?: string;
  type?: "command" | "agent";
  command?: string;
  content?: string;
}

interface Sop {
  name: string;
  description?: string;
  steps: SopStep[];
}

export class SopServer {
  private server: McpServer;
  private sopDir: string;

  constructor(sopDir?: string) {
    this.server = new McpServer({
      name: "sop-server",
      version: "1.0.0",
    });

    this.sopDir = resolve(sopDir || join(process.cwd(), ".agent", "sops"));
    this.setupTools();
  }

  private async listSops(): Promise<string[]> {
    if (!existsSync(this.sopDir)) return [];
    const files = await readdir(this.sopDir);
    return files.filter(f => f.endsWith(".yaml") || f.endsWith(".yml"));
  }

  private async readSop(name: string): Promise<Sop | null> {
    if (!existsSync(this.sopDir)) return null;

    // secure path handling
    const filename = name.endsWith(".yaml") || name.endsWith(".yml") ? name : `${name}.yaml`;
    const filepath = resolve(this.sopDir, filename);

    // Prevent directory traversal: must be strictly inside sopDir
    if (!filepath.startsWith(this.sopDir + sep)) {
      throw new Error("Invalid SOP name: Path traversal attempt detected");
    }

    if (!existsSync(filepath)) {
      // Try .yml
      const filepathYml = resolve(this.sopDir, `${name}.yml`);
      if (filepathYml.startsWith(this.sopDir + sep) && existsSync(filepathYml)) {
         const content = await readFile(filepathYml, "utf-8");
         return YAML.parse(content) as Sop;
      }
      return null;
    }

    const content = await readFile(filepath, "utf-8");
    return YAML.parse(content) as Sop;
  }

  private setupTools() {
    this.server.tool(
      "sop_list",
      "List all available Standard Operating Procedures (SOPs).",
      {},
      async () => {
        const sops = await this.listSops();
        if (sops.length === 0) {
            return { content: [{ type: "text", text: "No SOPs found in .agent/sops/" }] };
        }

        const descriptions = [];
        for (const file of sops) {
            try {
                const sop = await this.readSop(file);
                if (sop) {
                    descriptions.push(`- ${sop.name}: ${sop.description || "No description"}`);
                }
            } catch (e) {
                descriptions.push(`- ${file}: (Error reading file)`);
            }
        }

        return {
          content: [{ type: "text", text: descriptions.join("\n") }],
        };
      }
    );

    this.server.tool(
      "sop_get",
      "Get the content of a specific SOP.",
      {
        name: z.string().describe("The name of the SOP to retrieve."),
      },
      async ({ name }) => {
        try {
            const sop = await this.readSop(name);
            if (!sop) {
                return { content: [{ type: "text", text: `SOP '${name}' not found.` }], isError: true };
            }
            return {
                content: [{ type: "text", text: YAML.stringify(sop) }]
            };
        } catch (e: any) {
            return { content: [{ type: "text", text: `Error reading SOP: ${e.message}` }], isError: true };
        }
      }
    );

    this.server.tool(
      "sop_run",
      "Execute an SOP. Currently supports 'command' steps.",
      {
        name: z.string().describe("The name of the SOP to run."),
      },
      async ({ name }) => {
        try {
            const sop = await this.readSop(name);
            if (!sop) {
                return { content: [{ type: "text", text: `SOP '${name}' not found.` }], isError: true };
            }

            const results: string[] = [];
            let failed = false;

            for (let i = 0; i < sop.steps.length; i++) {
                const step = sop.steps[i];
                const stepName = step.name || `Step ${i + 1}`;

                results.push(`## ${stepName}`);

                if (step.type === "command" || step.command) {
                    const cmd = step.command || step.content;
                    if (!cmd) {
                         results.push(`Skipped: No command specified.`);
                         continue;
                    }

                    results.push(`> Running: ${cmd}`);

                    try {
                        await new Promise<void>((resolvePromise, rejectPromise) => {
                            const child = spawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });

                            let stdout = "";
                            let stderr = "";

                            if (child.stdout) {
                                child.stdout.on('data', (data) => {
                                    stdout += data.toString();
                                });
                            }

                            if (child.stderr) {
                                child.stderr.on('data', (data) => {
                                    stderr += data.toString();
                                });
                            }

                            child.on('close', (code) => {
                                if (stdout) results.push(`Output:\n${stdout.trim()}`);
                                if (stderr) results.push(`Stderr:\n${stderr.trim()}`);

                                if (code === 0) {
                                    results.push(`✔ Success`);
                                    resolvePromise();
                                } else {
                                    results.push(`✘ Failed with code ${code}`);
                                    const err = new Error(`Command failed with code ${code}`);
                                    (err as any).logged = true;
                                    rejectPromise(err);
                                }
                            });

                            child.on('error', (err) => {
                                rejectPromise(err);
                            });
                        });
                    } catch (e: any) {
                         if (!e.logged) {
                             results.push(`✘ Failed: ${e.message}`);
                         }
                         failed = true;
                         break; // Stop on failure
                    }
                } else {
                    results.push(`⚠ Manual Step Required: ${step.description || step.content || "No description"}`);
                    results.push(`(This step requires agent intervention or manual action. Execution paused.)`);
                    failed = true;
                    break;
                }
                results.push("\n");
            }

            return {
                content: [{ type: "text", text: results.join("\n") }],
                isError: failed
            };

        } catch (e: any) {
            return { content: [{ type: "text", text: `Error running SOP: ${e.message}` }], isError: true };
        }
      }
    );
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("SOP MCP Server running on stdio");
  }
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const server = new SopServer();
  server.run().catch((err) => {
    console.error("Fatal error in SOP MCP Server:", err);
    process.exit(1);
  });
}
