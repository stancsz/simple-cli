import { EpisodicMemory } from "../../../brain/episodic.js";
import { LLM } from "../../../llm.js";

/**
 * Fetches external market signals (mocked for now).
 * In production, this would call Serper, Brave Search, or a financial API.
 */
async function fetchExternalSignals(): Promise<any> {
  // Mock data representing market trends
  return {
    market_trends: [
      { topic: "Autonomous Agents", sentiment: "positive", growth: "high" },
      { topic: "AI Regulation", sentiment: "neutral", growth: "medium" },
      { topic: "Legacy SaaS", sentiment: "negative", growth: "low" }
    ],
    competitor_moves: [
      { competitor: "CompetitorX", action: "Launched AI HR tool", impact: "medium" },
      { competitor: "BigTechY", action: "Acquired AgentStartupZ", impact: "high" }
    ],
    timestamp: new Date().toISOString()
  };
}

/**
 * Analyzes internal and optionally external patterns to identify strategic insights.
 */
export const analyzePatterns = async (
  episodic: EpisodicMemory,
  llm: LLM,
  include_external_signals: boolean = false
) => {
  // 1. Fetch Internal Patterns (from Episodic Memory)
  // We look for 'swarm_negotiation_pattern' and general task 'success'/'failure'
  const internalMemories = await episodic.recall("pattern success failure", 20);

  const internalContext = internalMemories.map(m =>
    `- [${m.type || 'task'}] ${m.userPrompt.substring(0, 50)}... -> ${m.agentResponse.substring(0, 50)}...`
  ).join("\n");

  let externalContext = "No external signals requested.";
  if (include_external_signals) {
    const externalData = await fetchExternalSignals();
    externalContext = JSON.stringify(externalData, null, 2);
  }

  // 2. Synthesize with LLM
  const prompt = `
  You are the Chief Strategy Officer's Pattern Analysis Engine.

  INTERNAL PATTERNS (from Memory):
  ${internalContext}

  EXTERNAL SIGNALS (Market/Competitor Data):
  ${externalContext}

  TASK:
  Analyze the provided data to identify key strategic patterns.
  Focus on:
  1. Internal strengths/weaknesses based on past successes/failures.
  2. External opportunities/threats (if data is provided).
  3. Alignment or disconnects between internal capabilities and external trends.

  OUTPUT FORMAT:
  Return a JSON object:
  {
    "internal_patterns": ["List of key internal insights"],
    "external_trends": ["List of key external insights (if any)"],
    "synthesis": "A brief paragraph synthesizing the two views."
  }
  `;

  const response = await llm.generate(prompt, []);

  try {
    let jsonStr = response.message || response.thought || "";
    jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error("Failed to parse pattern analysis JSON", e);
    return {
      internal_patterns: [],
      external_trends: [],
      synthesis: "Failed to parse analysis."
    };
  }
};

export const crossAgencyPatternRecognition = async (
  topic: string,
  agencyNamespaces: string[],
  memory: EpisodicMemory,
  llm: LLM
): Promise<any> => {
  try {
    let aggregatedPatterns: any[] = [];

    for (const namespace of agencyNamespaces) {
      const results = await memory.recall(topic, 5, namespace);

      const insights = results.map((r: any) => ({
        agency: namespace,
        insight: r.solution || r.agentResponse || "Pattern logged",
        taskId: r.taskId || r.query || "unknown_task"
      }));
      aggregatedPatterns.push(...insights);
    }

    let summary = `No significant cross-agency patterns found for '${topic}'.`;
    let synthesisDetails = {};

    if (aggregatedPatterns.length > 0) {
      const contextStr = aggregatedPatterns.map(p => `- Agency: ${p.agency}, Task: ${p.taskId}, Insight: ${p.insight}`).join('\n');
      const systemPrompt = "You are a Meta-Orchestrator Brain analyzing patterns across multiple autonomous agencies.";
      const prompt = `
      TOPIC: ${topic}

      AGGREGATED EXPERIENCES:
      ${contextStr}

      TASK:
      Analyze these cross-agency experiences. Identify common successes, recurring failures, or bottlenecks.
      Synthesize a meta-level recommendation for the root orchestrator.

      OUTPUT FORMAT (JSON):
      {
        "common_successes": ["list", "of", "successes"],
        "recurring_failures": ["list", "of", "failures"],
        "meta_recommendation": "Overall strategic recommendation"
      }
      `;

      const response = await llm.generate(systemPrompt, [{ role: "user", content: prompt }]);
      let jsonStr = response.message || response.thought || "";
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }

      try {
        synthesisDetails = JSON.parse(jsonStr);
        summary = `Identified ${aggregatedPatterns.length} cross-agency experiences regarding '${topic}'. Meta-recommendation generated.`;
      } catch (parseErr) {
        console.error("Failed to parse cross-agency LLM synthesis", parseErr);
        summary = `Identified ${aggregatedPatterns.length} cross-agency experiences regarding '${topic}', but failed to synthesize cleanly.`;
      }

      // Store the synthesis back into episodic memory as a cross-agency pattern
      const metaTaskId = `meta_analysis_${Date.now()}`;
      await memory.store(
        metaTaskId,
        `Cross-agency pattern analysis for topic: ${topic}`,
        JSON.stringify(synthesisDetails),
        [], // no specific artifacts
        undefined, // no specific company namespace, it's a root level memory
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "cross_agency_pattern" // explicitly set the requested type
      );
    }

    return { summary, synthesis: synthesisDetails, details: aggregatedPatterns };
  } catch (e: any) {
    throw new Error(`Failed to perform cross-agency pattern recognition: ${e.message}`);
  }
};
