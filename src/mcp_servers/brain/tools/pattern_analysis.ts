import { EpisodicMemory, PastEpisode } from "../../../brain/episodic.js";
import { SemanticGraph } from "../../../brain/semantic_graph.js";
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
  memory: EpisodicMemory
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

    const summary = aggregatedPatterns.length > 0
      ? `Identified ${aggregatedPatterns.length} cross-agency patterns regarding '${topic}'. Recommendation: Standardize the most successful approach.`
      : `No significant cross-agency patterns found for '${topic}'.`;

    return { summary, details: aggregatedPatterns };
  } catch (e: any) {
    throw new Error(`Failed to perform cross-agency pattern recognition: ${e.message}`);
  }
};

export const analyzeCrossAgencyPatterns = async (
  agencyIds: string[],
  episodic: EpisodicMemory,
  semantic: SemanticGraph,
  llm: LLM,
  query?: string
): Promise<any> => {
  try {
    const memoryContexts: string[] = [];

    // Fetch episodic memories for the specified agencies
    for (const agencyId of agencyIds) {
      // In this system, agencies are namespaces (company field) or explicit source_agency
      // We will search across recent episodes in the root/default memory where source_agency matches,
      // AND we will search within the agency's specific namespace if available.
      let agencyMemories: PastEpisode[] = [];

      try {
        if (query) {
           agencyMemories = await episodic.recall(query, 10, agencyId);
        } else {
           agencyMemories = await episodic.getRecentEpisodes(agencyId, 20);
        }
      } catch (e) {
        // Fallback or ignore if namespace does not exist
      }

      try {
        let rootMemories: PastEpisode[] = [];
        if (query) {
           rootMemories = await episodic.recall(query, 20, "default");
        } else {
           rootMemories = await episodic.getRecentEpisodes("default", 50);
        }
        const filteredRoot = rootMemories.filter(m => m.source_agency === agencyId);
        agencyMemories.push(...filteredRoot);
      } catch (e) {
        // Ignore errors from root query
      }

      if (agencyMemories.length > 0) {
        const context = agencyMemories.map(m =>
          `[Task: ${m.taskId || 'unknown'}] Prompt: ${m.userPrompt.substring(0, 100)}... -> Response: ${m.agentResponse.substring(0, 100)}...`
        ).join("\n");
        memoryContexts.push(`=== Agency: ${agencyId} Episodic Memories ===\n${context}`);
      }
    }

    // Fetch semantic graph data
    let graphContext = "No relevant semantic relationships found.";
    try {
        const graphData = await semantic.query(query || "agency", "default");
        if (graphData && (graphData.nodes.length > 0 || graphData.edges.length > 0)) {
            const nodeStr = graphData.nodes.map((n: any) => `Node [${n.id}] (${n.type})`).join(", ");
            const edgeStr = graphData.edges.map((e: any) => `${e.from} -[${e.relation}]-> ${e.to}`).join(", ");
            graphContext = `Nodes: ${nodeStr}\nEdges: ${edgeStr}`;
        }
    } catch (e) {
        console.warn("Could not fetch semantic graph context for analysis:", e);
    }

    const fullContext = memoryContexts.length > 0 ? memoryContexts.join("\n\n") : "No episodic memories found for the specified agencies.";

    const prompt = `
    You are the central Brain's Cross-Agency Pattern Recognition Engine.
    Your task is to analyze the recent memories and activities of spawned child agencies to identify common themes, successful strategies, operational efficiency patterns, and emerging risks.

    EPISODIC MEMORIES BY AGENCY:
    ${fullContext}

    SEMANTIC GRAPH CONTEXT:
    ${graphContext}

    Analyze the above data and synthesize a comprehensive report.
    Return a structured JSON object with EXACTLY these keys:
    {
      "summary": "A high-level summary of all cross-agency activity and overall health.",
      "common_themes": ["Theme 1", "Theme 2"],
      "top_performers": ["Insights on which agency/strategy performed best and why"],
      "emerging_risks": ["Potential risks, bottlenecks, or conflicts observed"],
      "recommended_actions": ["Actionable recommendations for the root agency to optimize the ecosystem"]
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
      console.error("Failed to parse cross-agency pattern analysis JSON", e);
      return {
        summary: "Failed to parse analysis.",
        common_themes: [],
        top_performers: [],
        emerging_risks: [],
        recommended_actions: []
      };
    }

  } catch (e: any) {
    throw new Error(`Failed to execute analyzeCrossAgencyPatterns: ${e.message}`);
  }
};
