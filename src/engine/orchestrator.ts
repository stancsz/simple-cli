// Orchestrator: The central engine for the agent, now purely MCP-driven.
import readline from "readline";
import pc from "picocolors";
import { text, isCancel, log, spinner } from "@clack/prompts";
import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { pathToFileURL } from "url";
import { relative, join } from "path";
import { MCP } from "../mcp.js";
import { Skill } from "../skills.js";
import { LLM } from "../llm.js";
import { loadCompanyProfile, CompanyProfile } from "../context/company-profile.js";
import { ContextManager } from "../context/ContextManager.js";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  execute: (args: any, options?: { signal?: AbortSignal }) => Promise<any>;
}

// Helper to list files using MCP tools
async function getRepoMap(cwd: string, registry: Registry): Promise<string> {
  const listTool = registry.tools.get("list_directory") || registry.tools.get("ls") || registry.tools.get("list_files");
  if (!listTool) {
    return "(Repository listing unavailable - no filesystem tool found)";
  }

  try {
    const result: any = await listTool.execute({ path: cwd });
    if (result && result.content && Array.isArray(result.content)) {
      return result.content.map((c: any) => c.text).join("\n");
    }
    return String(result);
  } catch (e: any) {
    return `(Error listing files: ${e.message})`;
  }
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

  async buildPrompt(tools: Map<string, Tool>, registry: Registry) {
    const repoMap = await getRepoMap(this.cwd, registry);
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

  async loadCompanyTools(company: string) {
    const cwd = process.cwd();
    const toolsDir = join(cwd, ".agent", "companies", company, "tools");
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
            console.error(`Failed to load company tool ${f}:`, e);
          }
        }
      }
    }

    const skillsDir = join(cwd, ".agent", "skills");
    if (existsSync(skillsDir)) {
      for (const skillName of await readdir(skillsDir)) {
        const skillPath = join(skillsDir, skillName);
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
  protected s = spinner();

  constructor(
    protected llm: LLM,
    protected registry: Registry,
    protected mcp: MCP,
  ) {}

  protected async getUserInput(initialValue: string, interactive: boolean): Promise<string | undefined> {
    if (!interactive || !process.stdout.isTTY) return undefined;
    const res = await text({
      message: pc.cyan("Chat"),
      initialValue,
    });
    if (isCancel(res)) return undefined;
    return res as string;
  }

  protected log(type: 'info' | 'success' | 'warn' | 'error', message: string) {
    if (type === 'info') log.info(message);
    else if (type === 'success') log.success(message);
    else if (type === 'warn') log.warn(message);
    else if (type === 'error') log.error(message);
  }

  async run(
    ctx: Context,
    initialPrompt?: string,
    options: { interactive: boolean } = { interactive: true },
  ) {
    let input = initialPrompt;
    let bufferedInput = "";
    await this.mcp.init();

    // Auto-start Brain and Context servers
    try {
      const servers = this.mcp.listServers();
      if (servers.find((s) => s.name === "brain" && s.status === "stopped")) {
        await this.mcp.startServer("brain");
        this.log("success", "Brain server started.");
      }
      if (servers.find((s) => s.name === "context_server" && s.status === "stopped")) {
        await this.mcp.startServer("context_server");
        this.log("success", "Context server started.");
      }
      if (servers.find((s) => s.name === "aider" && s.status === "stopped")) {
        await this.mcp.startServer("aider");
        this.log("success", "Aider server started.");
      }
      if (servers.find((s) => s.name === "claude" && s.status === "stopped")) {
        await this.mcp.startServer("claude");
        this.log("success", "Claude server started.");
      }
    } catch (e) {
      console.error("Failed to start core servers:", e);
    }

    (await this.mcp.getTools()).forEach((t) =>
      this.registry.tools.set(t.name, t as any),
    );

    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
    }

    const companyName = process.env.JULES_COMPANY;
    let companyProfile: CompanyProfile | undefined;

    // Initialize CompanyContext if JULES_COMPANY is set
    if (companyName) {
      try {
        const { CompanyLoader } = await import("../context/company_loader.js");
        const loader = new CompanyLoader();
        companyProfile = await loader.load(companyName);
        this.log("success", `Loaded company context for ${companyName}`);
      } catch (e: any) {
        console.error("Failed to load company context:", e.message);
      }
    }

    let sharedContext = "";
    // Fetch shared context via ContextManager (Brain MCP)
    try {
        const contextManager = new ContextManager(this.mcp);
        const contextData = await contextManager.readContext();

        let contextParts: string[] = [];
        if (contextData.goals && contextData.goals.length > 0) contextParts.push(`Goals: ${contextData.goals.join(", ")}`);
        if (contextData.constraints && contextData.constraints.length > 0) contextParts.push(`Constraints: ${contextData.constraints.join(", ")}`);
        if (contextData.recent_changes && contextData.recent_changes.length > 0) contextParts.push(`Recent Changes: ${contextData.recent_changes.join(", ")}`);
        if (contextData.working_memory) contextParts.push(`Working Memory: ${contextData.working_memory}`);
        if (contextData.company_context) contextParts.push(`Company Context: ${contextData.company_context}`);

        if (contextParts.length > 0) {
            sharedContext = contextParts.join("\n\n");
            // Inject into system prompt once
            if (!ctx.skill.systemPrompt.includes("## Shared Agency Context")) {
               ctx.skill.systemPrompt = `${ctx.skill.systemPrompt}\n\n## Shared Agency Context\n${sharedContext}`;
            }
        }
    } catch (e) {
        console.warn("Failed to load shared context via ContextManager:", e);
    }

    while (true) {
      if (!input) {
        input = await this.getUserInput(bufferedInput, options.interactive);
        bufferedInput = "";
        if (!input) break;
      }

      // Brain: Recall similar past experiences
      const userRequest = input; // Capture original request
      let pastMemory: string | null = null;
      try {
        const brainClient = this.mcp.getClient("brain");
        if (brainClient) {
            const result: any = await brainClient.callTool({
                name: "brain_query",
                arguments: {
                  query: userRequest,
                  company: companyName
                }
            });
            if (result && result.content && result.content[0]) {
                 pastMemory = result.content[0].text;
            }
        }
      } catch (e) {
         // Ignore context errors
      }

      if (pastMemory && !pastMemory.includes("No relevant memory found")) {
        this.log("info", pc.dim(`[Brain] Recalled past experience.`));
        input = `[Past Experience]\n${pastMemory}\n\n[User Request]\n${input}`;
      }

      // Inject Company Profile Context
      if (companyProfile) {
         let profileContext = `[Company Context: ${companyProfile.name}]\n`;
         if (companyProfile.brandVoice) profileContext += `Brand Voice: ${companyProfile.brandVoice}\n`;
         if (companyProfile.internalDocs?.length) profileContext += `Docs: ${companyProfile.internalDocs.join(", ")}\n`;
         if (companyProfile.sops?.length) profileContext += `Recommended SOPs: ${companyProfile.sops.join(", ")}\n`;

         input = `${profileContext}\n${input}`;
      }

      ctx.history.push({ role: "user", content: input });

      // Inject RAG context from Company MCP Server
      if (companyName) {
        try {
          const client = this.mcp.getClient("company");
          if (client) {
             const result: any = await client.callTool({
                name: "company_get_context",
                arguments: { query: input }
             });

             if (result && result.content && result.content[0] && result.content[0].text) {
                const contextText = result.content[0].text;
                if (!contextText.includes("No company context active")) {
                   const lastMsg = ctx.history[ctx.history.length - 1];
                   lastMsg.content = `${contextText}\n\n[User Request]\n${lastMsg.content}`;
                   this.log("info", pc.dim(`[RAG] Injected company context.`));
                }
             }
          }
        } catch (e: any) {
          console.error("Failed to query company context:", e.message);
        }
      }

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

        if (!key.ctrl && !key.meta) {
          if (key.name === "backspace") {
            bufferedInput = bufferedInput.slice(0, -1);
          } else if (key.name === "return") {
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
        let prompt = await ctx.buildPrompt(this.registry.tools, this.registry);

        const userHistory = ctx.history.filter(
          (m) =>
            m.role === "user" &&
            !["Continue.", "Fix the error."].includes(m.content),
        );

        let typingStarted = false;
        const onTyping = () => {
          this.s.start("Typing...");
          typingStarted = true;
        };

        const response = await this.llm.generate(prompt, ctx.history, signal, onTyping);

        if (typingStarted) {
          this.s.stop("Response received");
        }

        if (response.usage) {
          const { promptTokens, completionTokens, totalTokens } =
            response.usage;
          this.log(
            "info",
            pc.dim(
              `Tokens: ${promptTokens ?? "?"} prompt + ${completionTokens ?? "?"} completion = ${totalTokens ?? "?"} total`,
            ),
          );
        }

        const { thought, tool, args, message, tools } = response;

        if (thought) this.log("info", pc.dim(thought));

        const executionList =
          tools && tools.length > 0
            ? tools
            : tool && tool !== "none"
              ? [{ tool, args }]
              : [];

        if (executionList.length > 0) {
          let allExecuted = true;
          const currentArtifacts: string[] = [];
          for (const item of executionList) {
            if (signal.aborted) break;

            const tName = item.tool;
            const tArgs = item.args;

            // Inject company context into sub-agents
            if ((tName === "aider_chat" || tName === "aider_edit" || tName === "ask_claude") && sharedContext) {
                 if (tArgs.message) {
                     tArgs.message = `## Shared Agency Context\n${sharedContext}\n\nTask:\n${tArgs.message}`;
                 } else if (tArgs.task) {
                     tArgs.task = `## Shared Agency Context\n${sharedContext}\n\nTask:\n${tArgs.task}`;
                 }
            }

            const t = this.registry.tools.get(tName);

            if (t) {
              this.s.start(`Executing ${tName}...`);
              let toolExecuted = false;
              let qaStarted = false;
              try {
                const result = await t.execute(tArgs, { signal });
                this.s.stop(`Executed ${tName}`);
                toolExecuted = true;

                if (tArgs && (tArgs.filepath || tArgs.path)) {
                   currentArtifacts.push(tArgs.filepath || tArgs.path);
                }

                if (tName === "create_tool" || tName === "mcp_start_server" || tName === "mcp_install_server") {
                  (await this.mcp.getTools()).forEach((t) =>
                    this.registry.tools.set(t.name, t as any),
                  );
                  this.log("success", "MCP tools updated.");
                }

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

                this.s.start(`[Supervisor] Verifying work from ${tName}...`);
                qaStarted = true;

                let qaPrompt = `Analyze the result of the tool execution: ${JSON.stringify(result)}. Did it satisfy the user's request: "${input || userHistory.pop()?.content}"? If specific files were mentioned (like flask app), check if they exist or look correct based on the tool output.`;

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
                  this.log("error",
                    `[Supervisor] Reason: ${qaCheck.message || qaCheck.thought}`,
                  );
                  this.log("error", `[Supervisor] Asking for retry...`);
                  input =
                    "The previous attempt failed. Please retry or fix the issue.";
                  allExecuted = false;
                  break;
                } else {
                  this.s.stop("[Supervisor] Verified");
                }
              } catch (e: any) {
                if (signal.aborted) throw e;
                if (!toolExecuted) this.s.stop(`Error executing ${tName}`);
                else if (qaStarted) {
                  this.s.stop("Verification Error");
                  this.log("error", `Error during verification: ${e.message}`);
                } else {
                  this.log("error", `Error: ${e.message}`);
                }

                ctx.history.push({
                  role: "user",
                  content: `Error executing ${tName}: ${e.message}`,
                });
                input = "Fix the error.";
                allExecuted = false;
                break;
              }
            } else {
              this.log("warn", `Tool '${tName}' not found.`);
              ctx.history.push({
                role: "user",
                content: `Tool '${tName}' not found. Please verify available tools.`,
              });
            }
          }

          if (signal.aborted) {
            input = undefined;
            continue;
          }

          if (allExecuted) {
            try {
                const brainClient = this.mcp.getClient("brain");
                if (brainClient) {
                    await brainClient.callTool({
                        name: "brain_store",
                        arguments: {
                            taskId: "task-" + Date.now(),
                            request: userRequest,
                            solution: message || response.thought || "Task completed.",
                            artifacts: JSON.stringify(currentArtifacts),
                            company: companyName
                        }
                    });
                }
            } catch (e) {
                console.warn("Failed to store memory via brain server:", e);
            }
            input = "The tool executions were verified. Proceed.";
          }
          continue;
        }

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
          this.log("warn", "Lazy/Hallucinating Agent detected. Forcing retry...");
          if (message) this.log("info", pc.dim(`Agent: ${message}`));

          ctx.history.push({
            role: "assistant",
            content: message || response.raw,
          });

          input =
            "System Correction: You MUST use an appropriate tool (e.g., 'write_file', 'aider_edit_files', 'ask_claude') to create or modify files. Do not describe the action or ask the user to do it.";
          continue;
        }

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
          input = undefined;
          continue;
        }
        this.log("error", `Error: ${e.message}`);

        if (!options.interactive) {
          throw e;
        }

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
