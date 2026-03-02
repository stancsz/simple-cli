import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { analyzeCrossSwarmPatternsPrompt } from "../prompts.js";

export const analyzeCrossSwarmPatterns = async (
  memory: EpisodicMemory,
  llm: ReturnType<typeof createLLM>,
  args: {
    agent_type?: string;
    swarm_id?: string;
    limit?: number;
  }
) => {
  const { agent_type, swarm_id, limit = 20 } = args;
  const context = `Agent Type: ${agent_type || "Any"}, Swarm ID: ${swarm_id || "Any"}`;

  // Fetch recent tasks and patterns
  // We fetch a bit more to allow for filtering
  const fetchLimit = limit * 2;

  const episodes = await memory.recall("outcome success failure", fetchLimit, undefined, "task");
  const patterns = await memory.recall("swarm negotiation", fetchLimit, undefined, "swarm_negotiation_pattern");

  const allEpisodes = [...episodes, ...patterns];

  // In-memory filtering
  let filtered = allEpisodes;

  if (agent_type) {
      const lowerType = agent_type.toLowerCase();
      filtered = filtered.filter(e =>
          (e.dreaming_outcomes && e.dreaming_outcomes.toLowerCase().includes(lowerType)) ||
          e.agentResponse.toLowerCase().includes(lowerType) ||
          e.userPrompt.toLowerCase().includes(lowerType)
      );
  }

  if (swarm_id) {
      filtered = filtered.filter(e => e.userPrompt.includes(swarm_id) || e.agentResponse.includes(swarm_id));
  }

  // Sort by timestamp descending and take top N
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  filtered = filtered.slice(0, limit);

  if (filtered.length === 0) {
      return { content: [{ type: "text" as const, text: "No relevant episodes found for analysis." }] };
  }

  const logSummaries = filtered.map(e =>
      `[${e.type?.toUpperCase() || 'TASK'}] ID: ${e.taskId}\nRequest: ${e.userPrompt}\nResult: ${e.agentResponse.substring(0, 300)}...`
  ).join("\n---\n");

  const prompt = analyzeCrossSwarmPatternsPrompt(logSummaries, context);
  const response = await llm.generate(prompt, []);

  return {
      content: [{ type: "text" as const, text: response.message || response.raw }]
  };
};
