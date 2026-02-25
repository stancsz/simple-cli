import { createLLM } from "../../llm.js";

export class Negotiator {
  private llm: ReturnType<typeof createLLM>;

  constructor() {
    this.llm = createLLM();
  }

  /**
   * Negotiates a task assignment.
   * If simulationMode is true, it analyzes the task to recommend a specialized role for a new agent.
   * If simulationMode is false, it evaluations bids from existing agents (logic moved/called from SwarmServer).
   */
  async negotiate(
      taskDescription: string,
      existingAgents: { id: string; role: string }[] = [],
      simulationMode: boolean = false
  ): Promise<{ winnerId?: string; role: string; rationale: string; strategy?: string; candidates?: any[] }> {

    if (simulationMode) {
        return this.negotiateSimulation(taskDescription);
    }

    // Default to picking from existing agents or recommending a new one if none fit
    // For now, if no agents provided, we default to simulation-like recommendation
    if (existingAgents.length === 0) {
        return this.negotiateSimulation(taskDescription);
    }

    // TODO: Implement advanced bidding logic for existing agents if needed.
    // For now, we return a generic response.
    return {
        winnerId: existingAgents[0].id,
        role: existingAgents[0].role,
        rationale: "Selected first available agent (default logic).",
        strategy: "default"
    };
  }

  private async negotiateSimulation(task: string): Promise<{ role: string; rationale: string; strategy: string; candidates: any[] }> {
      const systemPrompt = `You are the Swarm Intelligence Orchestrator.
      Analyze the following failed task to determine the optimal agent expertise required to fix it.

      Simulate a "Hive Mind" deliberation by proposing 3 distinct specialized agent candidates who could solve this.
      Then select the single best candidate.

      Output JSON format:
      {
        "candidates": [
          { "role": "...", "strategy": "...", "score": 85 },
          { "role": "...", "strategy": "...", "score": 92 }
        ],
        "winner": {
          "role": "...",
          "rationale": "...",
          "strategy": "..."
        }
      }`;

      const userPrompt = `Task/Failure Context: "${task}"`;

      try {
          const response = await this.llm.generate(systemPrompt, [{ role: "user", content: userPrompt }]);

          // LLM.generate attempts to parse JSON into response.tool/args or response.message
          // If it fails to find tool structure, it puts raw text in message or raw.

          let result: any = {};

          // Check if it parsed it as a tool call (even if we didn't ask for one explicitly, the JSON might be interpreted as such)
          // Or check raw
          const raw = response.raw || response.message || "";

          // Try to find JSON in raw text
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
              try {
                  result = JSON.parse(jsonMatch[0]);
              } catch {
                  // ignore
              }
          }

          const winner = result.winner || {};

          // Fallback if structure is flat (backward compatibility or LLM hallucination)
          if (!result.winner && result.role) {
              winner.role = result.role;
              winner.rationale = result.rationale;
              winner.strategy = result.strategy;
          }

          return {
              role: winner.role || "General Troubleshooter",
              rationale: winner.rationale || "General fix attempt.",
              strategy: winner.strategy || "Standard debugging.",
              candidates: result.candidates || []
          };
      } catch (e) {
          console.error("Error in negotiation LLM:", e);
          return {
              role: "Senior Developer",
              rationale: "Fallback due to negotiation error.",
              strategy: "Standard fix.",
              candidates: []
          };
      }
  }
}
