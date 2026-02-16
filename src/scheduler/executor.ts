import "dotenv/config";
import { fileURLToPath } from "url";
import { Context, Registry } from "../engine/orchestrator.js";
import { MCP } from "../mcp.js";
import { createLLM } from "../llm.js";
import { TaskDefinition } from "../interfaces/daemon.js";

import { join, dirname } from "path";
import { existsSync } from "fs";
import { readFile, mkdir, writeFile } from "fs/promises";
import pc from "picocolors";
import { getActiveSkill } from "../skills.js";

// Simple logger replacement for clack
const logger = {
  info: (msg: string) => console.log(pc.blue("[INFO]"), msg),
  success: (msg: string) => console.log(pc.green("[SUCCESS]"), msg),
  warn: (msg: string) => console.log(pc.yellow("[WARN]"), msg),
  error: (msg: string) => console.error(pc.red("[ERROR]"), msg),
  dim: (msg: string) => pc.dim(msg),
};

export class Executor {
  constructor(
    private llm: any,
    private registry: Registry,
    private mcp: MCP,
    private options: {
      yoloMode: boolean;
      timeout?: number;
      taskId?: string;
      taskName?: string;
    } = { yoloMode: true }
  ) { }

  async run(ctx: Context, initialPrompt: string) {
    let input: string | undefined = initialPrompt;

    // Initialize MCP and load tools
    await this.mcp.init();
    (await this.mcp.getTools()).forEach((t) =>
      this.registry.tools.set(t.name, t as any),
    );


    const startTime = Date.now();
    let status = "success";
    let errorMessage = "";

    try {
      while (true) {
        // Check timeout
        if (this.options.timeout && Date.now() - startTime > this.options.timeout) {
          logger.error("Task timed out.");
          throw new Error("Task execution exceeded timeout.");
        }

        if (!input) {
          // In non-interactive mode, if we have no input (and no pending tool execution which sets input),
          // we assume the agent has finished its turn.
          logger.info("Agent finished.");
          break;
        }

        ctx.history.push({ role: "user", content: input });

        const controller = new AbortController();
        const signal = controller.signal;

        try {
          const prompt = await ctx.buildPrompt(this.registry.tools, this.registry);
          const userHistory = ctx.history.filter(
            (m) =>
              m.role === "user" &&
              !["Continue.", "Fix the error.", "The tool executions were verified. Proceed."].includes(m.content),
          );

          const response = await this.llm.generate(prompt, ctx.history, signal);

          if (response.usage) {
            const { promptTokens, completionTokens, totalTokens } = response.usage;
            logger.info(
              logger.dim(
                `Tokens: ${promptTokens ?? "?"} prompt + ${completionTokens ?? "?"} completion = ${totalTokens ?? "?"} total`
              )
            );
          }

          const { thought, tool, args, message, tools } = response;

          if (thought) logger.info(logger.dim(thought));

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
              const tName = item.tool;
              const tArgs = item.args;
              const t = this.registry.tools.get(tName);

              if (t) {
                logger.info(`Executing ${tName}...`);

                try {
                  const result = await t.execute(tArgs, { signal });
                  logger.success(`Executed ${tName}`);

                  // Reload tools if create_tool was used
                  if (tName === "create_tool") {
                    logger.success("Tool creation handled via MCP.");
                  }

                  // Reload tools if mcp_start_server was used
                  if (tName === "mcp_start_server") {
                    (await this.mcp.getTools()).forEach((t) =>
                      this.registry.tools.set(t.name, t as any),
                    );
                    logger.success("MCP tools updated.");
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

                  // Supervisor Logic (Self-Correction)
                  logger.info(`[Supervisor] Verifying work from ${tName}...`);

                  let qaPrompt = `Analyze the result of the tool execution: ${JSON.stringify(result)}. Did it satisfy the user's request: "${input || userHistory.pop()?.content}"? If specific files were mentioned, check if they exist or look correct based on the tool output.`;

                  const qaCheck = await this.llm.generate(
                    qaPrompt,
                    [...ctx.history, { role: "user", content: qaPrompt }],
                    signal
                  );

                  if (qaCheck.message && qaCheck.message.toLowerCase().includes("fail")) {
                    logger.error(`[Supervisor] QA FAILED: ${qaCheck.message || qaCheck.thought}`);
                    logger.info(`[Supervisor] Retrying...`);
                    input = "The previous attempt failed. Please retry or fix the issue.";
                    allExecuted = false;
                    break; // Stop batch execution on failure
                  } else {
                    logger.success("[Supervisor] Verified");
                  }

                } catch (e: any) {
                  logger.error(`Error executing ${tName}: ${e.message}`);
                  ctx.history.push({
                    role: "user",
                    content: `Error executing ${tName}: ${e.message}`,
                  });
                  input = "Fix the error.";
                  allExecuted = false;
                  break;
                }
              } else {
                logger.warn(`Tool ${tName} not found.`);
                ctx.history.push({
                  role: "user",
                  content: `Error: Tool ${tName} not found.`,
                });
                input = "Fix the error.";
                allExecuted = false;
                break;
              }
            }

            if (allExecuted) {
              input = "The tool executions were verified. Proceed.";
            }
            continue;
          }

          // Lazy Agent Detection
          const rawText = (message || response.raw || "").toLowerCase();
          const isRefusal =
            /(cannot|can't|unable to|no access|don't have access) (to )?(create|write|modify|delete|save|edit)/.test(rawText) ||
            /(did not|didn't) (create|write|modify|delete|save|edit).*?file/.test(rawText);
          const isHallucination =
            /(i|i've|i have) (created|updated|modified|deleted|saved|written) (the file|a file)/.test(rawText);
          const isLazyInstruction =
            /(please|you need to|you should|run this) (create|save|write|copy)/.test(rawText) && /(file|code)/.test(rawText);

          if (isRefusal || isHallucination || isLazyInstruction) {
            logger.warn("Lazy/Hallucinating Agent detected. Forcing retry...");
            if (message) logger.info(logger.dim(`Agent: ${message}`));
            ctx.history.push({
              role: "assistant",
              content: message || response.raw,
            });
            input = "System Correction: You MUST use an appropriate tool (e.g., 'write_file', 'aider_edit_files', 'ask_claude') to create or modify files. Do not describe the action or ask the user to do it.";
            continue;
          }

          if (message || response.raw) {
            logger.info("Agent:");
            console.log(message || response.raw);
            console.log();
          }

          ctx.history.push({
            role: "assistant",
            content: message || response.raw,
          });

          // Agent responded with text only. Turn complete.
          input = undefined;

        } catch (e: any) {
          logger.error(`Error: ${e.message}`);
          throw e;
        }
      }
    } catch (e: any) {
      status = "failed";
      errorMessage = e.message;
      throw e;
    } finally {
      if (this.options.taskId && this.options.taskName) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const logPath = join(ctx.cwd, '.agent/logs', `${timestamp}_${this.options.taskId}.json`);
          await mkdir(dirname(logPath), { recursive: true });
          await writeFile(logPath, JSON.stringify({
            taskId: this.options.taskId,
            taskName: this.options.taskName,
            startTime,
            endTime: Date.now(),
            status,
            errorMessage,
            history: ctx.history
          }, null, 2));
          logger.info(`Log saved to ${logPath}`);
        } catch (logErr) {
          logger.error(`Failed to save log: ${logErr}`);
        }
      }
    }
  }
}


// Script Entry Point
if (import.meta.url === "file://" + process.argv[1] || process.argv[1].endsWith("executor.ts") || process.argv[1].endsWith("executor.js")) {
  const main = async () => {
    const taskDefStr = process.env.JULES_TASK_DEF;
    if (!taskDefStr) {
      console.error("No task definition provided (JULES_TASK_DEF).");
      process.exit(1);
    }

    let taskDef: TaskDefinition;
    try {
      taskDef = JSON.parse(taskDefStr);
    } catch (e) {
      console.error("Failed to parse JULES_TASK_DEF:", e);
      process.exit(1);
    }

    const cwd = process.cwd();

    const registry = new Registry();
    // allBuiltins removed


    const mcp = new MCP();
    const provider = createLLM();

    const runner = new Executor(provider, registry, mcp, {
      yoloMode: taskDef.yoloMode ?? true,
      timeout: taskDef.autoDecisionTimeout,
      taskId: taskDef.id,
      taskName: taskDef.name
    });

    const skill = await getActiveSkill(cwd);

    // Load and inject Agent Soul if exists
    const soulPath = join(cwd, "src", "agents", "souls", `${taskDef.name}.md`);
    if (existsSync(soulPath)) {
      try {
        const soulContent = await readFile(soulPath, "utf-8");
        skill.systemPrompt += `\n\n## Agent Instructions (Soul)\n${soulContent}`;
        console.log(`Loaded soul for agent: ${taskDef.name}`);
      } catch (e) {
        console.error(`Failed to load soul for agent ${taskDef.name}:`, e);
      }
    }

    const ctx = new Context(cwd, skill);

    console.log(`Starting task: ${taskDef.name} (ID: ${taskDef.id})`);

    try {
      await runner.run(ctx, taskDef.prompt);
      console.log(`Task ${taskDef.name} completed successfully.`);
      process.exit(0);
    } catch (e: any) {
      console.error(`Task ${taskDef.name} failed:`, e);
      process.exit(1);
    }
  };

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
