import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { createLLM } from "../../llm.js";
import { CrewAIServer } from "../crewai/index.js";
import { EpisodicMemory } from "../../brain/episodic.js";
import { FailureLog, DreamStrategy } from "./types.js";
import { randomUUID } from "crypto";

export class DreamSimulator {
  private llm = createLLM();
  private memory = new EpisodicMemory();

  /**
   * Scans the logs directory for recent failures.
   */
  async scanFailures(days: number = 7): Promise<FailureLog[]> {
    const logDir = join(process.cwd(), "logs");
    if (!existsSync(logDir)) {
      console.warn("Logs directory not found:", logDir);
      return [];
    }

    const files = await readdir(logDir);
    const failures: FailureLog[] = [];
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    const { stat } = await import("fs/promises");

    for (const file of files) {
      if (!file.endsWith(".log")) continue;

      const filePath = join(logDir, file);

      try {
        const stats = await stat(filePath);
        if (stats.mtimeMs < cutoff) continue;

        const content = await readFile(filePath, "utf-8");
        // Simple heuristic: Look for "Error:" or "Failed:" blocks
        // and try to associate them with a "Task:" line above.

        const lines = content.split("\n");
        let lastTask = "Unknown Task";

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes("Task:")) {
            lastTask = line.split("Task:")[1].trim();
          }

          if (line.includes("Error:") || line.includes("Failed:")) {
            // Found a failure
            failures.push({
              id: randomUUID(),
              timestamp: new Date().toISOString(), // In real log, parse timestamp
              task: lastTask,
              error: line.trim(),
              sourceFile: file,
              context: lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 5)).join("\n")
            });
            // Reset task to avoid duplicate attribution if multiple errors
            lastTask = "Unknown Task";
          }
        }
      } catch (e) {
        console.error(`Failed to read log file ${file}:`, e);
      }
    }

    return failures;
  }

  /**
   * Generates a new strategy for a given failure using LLM.
   */
  async generateStrategy(failure: FailureLog): Promise<DreamStrategy> {
    const systemPrompt = `
      You are an expert software architect analyzing a past failure.
      Analyze the error and the task context.
      Propose a robust strategy to solve the task and avoid the error.
      Output ONLY the strategy description.
    `;

    const userPrompt = `
      Task: ${failure.task}
      Error: ${failure.error}
      Context:
      ${failure.context}
    `;

    const response = await this.llm.generate(systemPrompt, [{ role: "user", content: userPrompt }]);

    return {
      id: randomUUID(),
      originalFailureId: failure.id,
      task: failure.task,
      proposedApproach: response.message,
      outcome: "failure", // Default, will update after simulation
      executionResult: "",
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Runs a simulation using the CrewAI agent to test the strategy.
   */
  async runSimulation(strategy: DreamStrategy): Promise<DreamStrategy> {
    const crewServer = new CrewAIServer();

    // Construct a task that includes the strategy
    const simulationTask = `
      Original Task: ${strategy.task}
      Proposed Strategy: ${strategy.proposedApproach}

      Please execute this task applying the proposed strategy.
      Report success or failure clearly.
    `;

    try {
      // CrewAIServer.startCrew returns { content: [{ type: 'text', text: '...' }] }
      const result: any = await crewServer.startCrew(simulationTask);
      const outputText = result.content?.[0]?.text || "";

      strategy.executionResult = outputText;

      // Determine success/failure based on output
      if (outputText.toLowerCase().includes("success") && !outputText.toLowerCase().includes("failed")) {
        strategy.outcome = "success";
      } else {
        strategy.outcome = "failure";
      }

    } catch (e: any) {
      strategy.executionResult = `Simulation threw exception: ${e.message}`;
      strategy.outcome = "failure";
    }

    return strategy;
  }

  /**
   * Stores the successful strategy in the Brain.
   */
  async storeInsight(strategy: DreamStrategy): Promise<void> {
    if (strategy.outcome !== "success") return;

    await this.memory.store(
      `dream-${strategy.id}`,
      `Task: ${strategy.task} (Recovered from failure)`,
      `Strategy: ${strategy.proposedApproach}\n\nOutcome: ${strategy.executionResult}`,
      ["dream-simulation"],
      "dreaming" // Use 'dreaming' company/namespace
    );
  }

  /**
   * Retrieves stored insights/strategies for a given query.
   */
  async getInsights(query: string, limit: number = 3): Promise<string[]> {
    const results = await this.memory.recall(query, limit, "dreaming");
    return results.map(r =>
      `[Dream Insight] Task: ${r.userPrompt}\nStrategy: ${r.agentResponse}`
    );
  }
}
