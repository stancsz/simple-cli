import { createLLM } from "../llm.js";
import { logMetric } from "../logger.js";
import { TaskDefinition } from "../interfaces/daemon.js";
import { join, dirname } from "path";
import { mkdir, writeFile } from "fs/promises";

export interface BatchTask {
  task: TaskDefinition;
  startTime: number;
  resolve: (value: string | PromiseLike<string>) => void;
  reject: (reason?: any) => void;
}

export class PromptBatcher {
  private static instance: PromptBatcher;
  private queue: Map<string, BatchTask[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private batchDelayMs: number;

  private constructor(batchDelayMs: number = 30000) {
    this.batchDelayMs = batchDelayMs;
  }

  public static getInstance(batchDelayMs?: number): PromptBatcher {
    if (!PromptBatcher.instance) {
      PromptBatcher.instance = new PromptBatcher(batchDelayMs);
    }
    return PromptBatcher.instance;
  }

  public scheduleBatch(groupId: string, task: TaskDefinition): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.queue.has(groupId)) {
        this.queue.set(groupId, []);
      }
      this.queue.get(groupId)!.push({ task, startTime: Date.now(), resolve, reject });

      if (!this.timers.has(groupId)) {
        this.timers.set(
          groupId,
          setTimeout(() => this.executeBatch(groupId), this.batchDelayMs)
        );
      }
    });
  }

  private async executeBatch(groupId: string) {
    const tasks = this.queue.get(groupId);
    if (!tasks || tasks.length === 0) return;

    // Clear queue and timer
    this.queue.delete(groupId);
    this.timers.delete(groupId);

    if (tasks.length === 1) {
       // Only one task, no need to batch
       try {
          const llm = createLLM();
          const response = await llm.generate(
             tasks[0].task.prompt || "No prompt provided.",
             [{ role: "user", content: "Execute task" }]
          );
          const responseText = response.message || response.raw;
          await this.saveTaskLog(tasks[0], "success", responseText);
          tasks[0].resolve(responseText);
       } catch (e: any) {
          await this.saveTaskLog(tasks[0], "failed", "", e.message);
          tasks[0].reject(e);
       }
       return;
    }

    // Combine prompts
    let combinedPrompt = `You are executing a batched set of tasks. You must provide a response for EACH task enclosed in corresponding XML tags.
The tasks are:

`;
    for (const bt of tasks) {
      combinedPrompt += `<task id="${bt.task.id}">
${bt.task.prompt}
</task>\n\n`;
    }

    combinedPrompt += `For each task, your response must be formatted exactly like this:
<response id="[task_id]">
[Your response to the task here]
</response>

Ensure you provide a response block for every task ID provided above.`;

    try {
      const llm = createLLM();
      const response = await llm.generate(
        "You are an expert autonomous agent.",
        [{ role: "user", content: combinedPrompt }]
      );

      const rawResponse = response.message || response.raw;

      // Extract responses
      const extractedResponses: Record<string, string> = {};
      const regex = /<response id="([^"]+)">([\s\S]*?)<\/response>/g;
      let match;
      while ((match = regex.exec(rawResponse)) !== null) {
        extractedResponses[match[1]] = match[2].trim();
      }

      // Resolve promises and save logs
      for (const bt of tasks) {
        if (extractedResponses[bt.task.id]) {
          await this.saveTaskLog(bt, "success", extractedResponses[bt.task.id]);
          bt.resolve(extractedResponses[bt.task.id]);
        } else {
          // Fallback if LLM missed it
          const errText = `[Batch Error] No response generated for task ${bt.task.id}. Raw: ${rawResponse.substring(0, 100)}...`;
          await this.saveTaskLog(bt, "failed", "", errText);
          bt.resolve(errText);
        }
      }

      // Log metrics
      const totalTasks = tasks.length;
      logMetric('llm_batcher', 'batched_prompts_total', totalTasks, { groupId });

      // Rough estimation: each individual prompt would have overhead (system prompt + history).
      // Let's assume an individual call is ~500 tokens of overhead.
      // Savings = (Tasks - 1) * Overhead Tokens
      const overheadEstimation = 500;
      const tokensSaved = (totalTasks - 1) * overheadEstimation;
      logMetric('llm_batcher', 'tokens_saved_via_batching', tokensSaved, { groupId });

    } catch (e: any) {
      // Reject all on failure and save error logs
      for (const bt of tasks) {
        await this.saveTaskLog(bt, "failed", "", e.message);
        bt.reject(e);
      }
    }
  }

  private async saveTaskLog(bt: BatchTask, status: string, response: string, errorMessage: string = "") {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const cwd = process.cwd();
      const logPath = join(cwd, '.agent/logs', `${timestamp}_${bt.task.id}.json`);
      await mkdir(dirname(logPath), { recursive: true });
      await writeFile(logPath, JSON.stringify({
          taskId: bt.task.id,
          taskName: bt.task.name,
          startTime: bt.startTime,
          endTime: Date.now(),
          status,
          errorMessage,
          history: [
            { role: "user", content: bt.task.prompt || "Execute task" },
            { role: "assistant", content: response || errorMessage }
          ]
      }, null, 2));
    } catch (logErr) {
        console.error(`[Batcher] Failed to save log for ${bt.task.id}: ${logErr}`);
    }
  }
}
