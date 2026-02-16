// TODO: [Refactor] This entire engine should act as a 'Universal Adapter'.
// Instead of manually loading tools or parsing lazy agent outputs with regex,
// it should ingest standardized MCP tool definitions and digest them into a shared context.

import { readFile, writeFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join, relative, resolve } from "path";
import { pathToFileURL } from "url";
import readline from "readline";
import pc from "picocolors";
import { text, isCancel, log, spinner } from "@clack/prompts";
import { createLLM } from "./llm.js";
import { MCP } from "./mcp.js";
import { Skill } from "./skills.js";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}
export interface Tool {
  name: string;
  description: string;
  execute: (args: any, options?: { signal?: AbortSignal }) => Promise<any>;
}

async function getRepoMap(cwd: string) {
  const files: string[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (["node_modules", ".git", "dist"].includes(e.name)) continue;
      const res = join(dir, e.name);
      if (e.isDirectory()) await walk(res);
      else if ([".ts", ".js", ".py", ".md"].includes(res.slice(-3)))
        files.push(relative(cwd, res));
    }
  }
  try {
    await walk(cwd);
  } catch { }
  return files.slice(0, 50).join("\n");
}

export class Context {
  history: Message[] = [];
  activeFiles: Set<string> = new Set();
  cwd: string;
  skill: Skill;

  constructor(cwd: string, skill: Skill) {
    this.cwd = cwd;
    this.skill = skill;
  }

  async buildPrompt(tools: Map<string, Tool>) {
    const repoMap = await getRepoMap(this.cwd);
    const toolDefs = Array.from(tools.values())
      .map((t) => {
        const schema = (t as any).inputSchema;
        if (schema && schema.shape) {
          const args = Object.keys(schema.shape).join(", ");
          return `- ${t.name}(${args}): ${t.description}`;
        }
        return `- ${t.name}: ${t.description}`;
      })
      .join("\n");
    return `${this.skill.systemPrompt}\n\n## Tools\n${toolDefs}\n\n## Repository\n${repoMap}\n\n## Active Files\n${Array.from(
      this.activeFiles,
    )
      .map((f) => relative(this.cwd, f))
      .join(", ")}`;
  }
}

export class Registry {
  tools: Map<string, Tool> = new Map();

  async loadProjectTools(cwd: string) {
    // TODO: [Ingest] Deprecate this manual tool scanning.
    // Tools should be loaded exclusively via MCP Server discovery (mcp.json).
    // The concept of "Legacy Flat Tools" and "Skill-Based Tools" should migrate to local MCP servers.

    // 1. Scan Legacy Flat Tools
    const toolsDir = join(cwd, ".agent", "tools");
    if (existsSync(toolsDir)) {
      for (const f of await readdir(toolsDir)) {
        if (f.endsWith(".ts") || f.endsWith(".js")) {
          try {
            const mod = await import(pathToFileURL(join(toolsDir, f)).href);
            const t = mod.tool || mod.default;
            if (Array.isArray(t)) {
              t.forEach(tool => { if (tool?.name) this.tools.set(tool.name, tool); });
            } else if (t?.name) {
              this.tools.set(t.name, t);
            }
          } catch (e) {
            console.error(`Failed to load tool ${f}:`, e);
          }
        }
      }
    }

    // 2. Scan Skill-Based Tools (.agent/skills/*/tools.ts)
    const skillsDir = join(cwd, ".agent", "skills");
    if (existsSync(skillsDir)) {
      for (const skillName of await readdir(skillsDir)) {
        const skillPath = join(skillsDir, skillName);
        // Look for tools.ts or index.ts
        const potentialFiles = ["tools.ts", "index.ts", "tools.js", "index.js"];

        for (const file of potentialFiles) {
          const filePath = join(skillPath, file);
          if (existsSync(filePath)) {
            try {
              const mod = await import(pathToFileURL(filePath).href);
              const t = mod.tool || mod.default;
              if (Array.isArray(t)) {
                t.forEach(tool => { if (tool?.name) this.tools.set(tool.name, tool); });
              } else if (t?.name) {
                this.tools.set(t.name, t);
              }
            } catch (e) {
              console.error(`Failed to load tools for skill ${skillName}:`, e);
            }
          }
        }
      }
    }
  }
}


export class Engine {
  private s = spinner();

  constructor(
    private llm: any,
    private registry: Registry,
    private mcp: MCP,
  ) { }

  async run(
    ctx: Context,
    initialPrompt?: string,
    options: { interactive: boolean } = { interactive: true },
  ) {
    let input = initialPrompt;
    let bufferedInput = "";
    await this.mcp.init();
    (await this.mcp.getTools()).forEach((t) =>
      this.registry.tools.set(t.name, t as any),
    );

    // Ensure tools are loaded for the context cwd
    await this.registry.loadProjectTools(ctx.cwd);

    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
    }

    while (true) {
      if (!input) {
        if (!options.interactive || !process.stdout.isTTY) break;
        const res = await text({
          message: pc.cyan("Chat"),
          initialValue: bufferedInput,
        });
        bufferedInput = "";
        if (isCancel(res)) break;
        input = res as string;
      }

      ctx.history.push({ role: "user", content: input });

      const controller = new AbortController();
      const signal = controller.signal;
      let aborted = false;

      const onKeypress = (str: string, key: any) => {
        if (key.ctrl && key.name === "c") {
          log.warn("Interrupted by user.");
          aborted = true;
          controller.abort();
          return;
        }
        if (key.name === "escape") {
          log.warn("Interrupted by user.");
          aborted = true;
          controller.abort();
          return;
        }

        // Type-ahead buffering
        if (!key.ctrl && !key.meta) {
          if (key.name === "backspace") {
            bufferedInput = bufferedInput.slice(0, -1);
          } else if (key.name === "return") {
            // Do nothing for return, user must hit it again at prompt
          } else if (str && str.length === 1) {
            bufferedInput += str;
          }
        }
      };

      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.on("keypress", onKeypress);
      }

      try {
        let prompt = await ctx.buildPrompt(this.registry.tools);

        const userHistory = ctx.history.filter(
          (m) =>
            m.role === "user" &&
            !["Continue.", "Fix the error."].includes(m.content),
        );

        // Pass signal to LLM
        const response = await this.llm.generate(prompt, ctx.history, signal);

        if (response.usage) {
          const { promptTokens, completionTokens, totalTokens } =
            response.usage;
          log.info(
            pc.dim(
              `Tokens: ${promptTokens ?? "?"} prompt + ${completionTokens ?? "?"} completion = ${totalTokens ?? "?"} total`,
            ),
          );
        }

        const { thought, tool, args, message, tools } = response;

        if (thought) log.info(pc.dim(thought));

        // Determine execution list
        const executionList =
          tools && tools.length > 0
            ? tools
            : tool && tool !== "none"
              ? [{ tool, args }]
              : [];

        if (executionList.length > 0) {
          let allExecuted = true;
          for (const item of executionList) {
            if (signal.aborted) break;

            const tName = item.tool;
            const tArgs = item.args;
            const t = this.registry.tools.get(tName);

            if (t) {
              this.s.start(`Executing ${tName}...`);
              let toolExecuted = false;
              let qaStarted = false;
              try {
                const result = await t.execute(tArgs, { signal });
                this.s.stop(`Executed ${tName}`);
                toolExecuted = true;

                // Reload tools if create_tool was used
                if (tName === "create_tool") {
                  await this.registry.loadProjectTools(ctx.cwd);
                  log.success("Tools reloaded.");
                }

                // Reload tools if mcp_start_server was used
                if (tName === "mcp_start_server") {
                  (await this.mcp.getTools()).forEach((t) =>
                    this.registry.tools.set(t.name, t as any),
                  );
                  log.success("MCP tools updated.");
                }

                // Add individual tool execution to history to keep context updated
                // We mock a single tool response for history consistency
                ctx.history.push({
                  role: "assistant",
                  content: JSON.stringify({
                    thought: "",
                    tool: tName,
                    args: tArgs,
                  }),
                });
                ctx.history.push({
                  role: "user",
                  content: `Result: ${JSON.stringify(result)}`,
                });

                // --- Supervisor Loop (QA & Reflection) ---
                this.s.start(`[Supervisor] Verifying work from ${tName}...`);
                qaStarted = true;

                let qaPrompt = `Analyze the result of the tool execution: ${JSON.stringify(result)}. Did it satisfy the user's request: "${input || userHistory.pop()?.content}"? If specific files were mentioned (like flask app), check if they exist or look correct based on the tool output.`;

                if (tName === "delegate_cli") {
                  qaPrompt +=
                    " Since this was delegated to an external CLI, be extra critical. Does the output explicitly confirm file creation?";
                }

                const qaCheck = await this.llm.generate(
                  qaPrompt,
                  [...ctx.history, { role: "user", content: qaPrompt }],
                  signal,
                );

                if (
                  qaCheck.message &&
                  qaCheck.message.toLowerCase().includes("fail")
                ) {
                  this.s.stop(`[Supervisor] QA FAILED`);
                  log.error(
                    `[Supervisor] Reason: ${qaCheck.message || qaCheck.thought}`,
                  );
                  log.error(`[Supervisor] Asking for retry...`);
                  input =
                    "The previous attempt failed. Please retry or fix the issue.";
                  allExecuted = false;
                  break; // Stop batch execution on failure
                } else {
                  this.s.stop("[Supervisor] Verified");
                }
              } catch (e: any) {
                if (signal.aborted) throw e; // Re-throw if it was an abort
                if (!toolExecuted) this.s.stop(`Error executing ${tName}`);
                else if (qaStarted) {
                  this.s.stop("Verification Error");
                  log.error(`Error during verification: ${e.message}`);
                } else {
                  log.error(`Error: ${e.message}`);
                }

                ctx.history.push({
                  role: "user",
                  content: `Error executing ${tName}: ${e.message}`,
                });
                input = "Fix the error.";
                allExecuted = false;
                break;
              }
            }
          }

          if (signal.aborted) {
            input = undefined;
            continue;
          }

          if (allExecuted) {
            input = "The tool executions were verified. Proceed.";
          }
          continue;
        }

        // --- Lazy Agent Detection ---
        // TODO: [Refactor] Remove regex-based lazy agent detection.
        // Instead, valid MCP tools should enforce structured outputs or errors.
        // If an agent (like Devin) is lazy, the Devin MCP Server wrapper should handle the retry logic, not this engine.
        const rawText = (message || response.raw || "").toLowerCase();
        const isRefusal =
          /(cannot|can't|unable to|no access|don't have access) (to )?(create|write|modify|delete|save|edit)/.test(
            rawText,
          ) ||
          /(did not|didn't) (create|write|modify|delete|save|edit).*?file/.test(
            rawText,
          );
        const isHallucination =
          /(i|i've|i have) (created|updated|modified|deleted|saved|written) (the file|a file)/.test(
            rawText,
          );
        const isLazyInstruction =
          /(please|you need to|you should|run this) (create|save|write|copy)/.test(
            rawText,
          ) && /(file|code)/.test(rawText);

        if (isRefusal || isHallucination || isLazyInstruction) {
          log.warn("Lazy/Hallucinating Agent detected. Forcing retry...");
          if (message) log.info(pc.dim(`Agent: ${message}`));

          ctx.history.push({
            role: "assistant",
            content: message || response.raw,
          });

          input =
            "System Correction: You MUST use the 'delegate_cli' tool to create or modify files via subagents. Do not describe the action or ask the user to do it. Use the tool now.";
          continue;
        }
        // ----------------------------

        if (message || response.raw) {
          console.log();
          console.log(pc.blue("Agent:"));
          console.log(message || response.raw);
          console.log();
        }
        ctx.history.push({
          role: "assistant",
          content: message || response.raw,
        });
        input = undefined;
      } catch (e: any) {
        if (aborted || signal.aborted || e.name === "AbortError") {
          // Already logged interruption or will just loop back
          input = undefined;
          continue;
        }
        // Log actual errors
        log.error(`Error: ${e.message}`);

        if (!options.interactive) {
          throw e;
        }

        // Break or continue? Probably continue to prompt
        input = undefined;
      } finally {
        if (process.stdin.isTTY) {
          process.stdin.removeListener("keypress", onKeypress);
          process.stdin.setRawMode(false);
        }
      }
    }
  }
}
