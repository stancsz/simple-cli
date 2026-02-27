import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { readStrategy } from "./strategy.js";
import { analyzePatterns } from "./pattern_analysis.js";

/**
 * Executes a full Strategic Horizon Scan.
 * This synthesizes internal performance, external market signals, and current strategy
 * into a structured report for the C-Suite.
 */
export const scanStrategicHorizon = async (
  episodic: EpisodicMemory,
  company?: string
) => {
  const llm = createLLM();

  // 1. Gather Intelligence
  // Parallel execution for speed
  const [currentStrategy, patternAnalysis] = await Promise.all([
    readStrategy(episodic, company),
    analyzePatterns(episodic, llm, true) // Include external signals
  ]);

  // 2. Synthesize Strategic Report
  const prompt = `
  You are the Chief Strategy Officer (CSO) of an autonomous AI agency.
  Your task is to produce a "Strategic Horizon Report" for the Board.

  CURRENT CORPORATE STRATEGY:
  ${currentStrategy ? JSON.stringify(currentStrategy, null, 2) : "No formal strategy defined yet."}

  PATTERN ANALYSIS (Internal & External):
  ${JSON.stringify(patternAnalysis, null, 2)}

  TASK:
  Synthesize this information into a forward-looking strategic report.

  The report MUST follow this structure:
  1. Emerging Opportunities: What new areas should we explore?
  2. Potential Threats: What risks (internal or external) must be mitigated?
  3. Strategic Recommendations: Concrete actions to update our strategy.

  OUTPUT FORMAT:
  Return ONLY a valid JSON object matching this schema:
  {
    "emerging_opportunities": ["Opportunity 1", "Opportunity 2"],
    "potential_threats": ["Threat 1", "Threat 2"],
    "strategic_recommendations": [
      {
        "action": "Description of action",
        "priority": "high" | "medium" | "low",
        "rationale": "Why this is important"
      }
    ],
    "synthesis_summary": "Executive summary of the horizon scan."
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
  } catch (e: any) {
    throw new Error(`Failed to generate Strategic Horizon Report: ${e.message}`);
  }
};
