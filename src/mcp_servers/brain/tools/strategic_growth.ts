import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { readStrategy } from "./strategy.js";

export interface GrowthTargets {
    target_markets: string[];
    icp_attributes: Record<string, any>;
    strategic_goals: string[];
}

/**
 * Retrieves the current corporate strategy and extracts targeted growth vectors using an LLM.
 */
export const getGrowthTargets = async (
    episodic: EpisodicMemory,
    llm: ReturnType<typeof createLLM>,
    company?: string
): Promise<GrowthTargets> => {
    // 1. Fetch current strategy
    const strategy = await readStrategy(episodic, company);

    if (!strategy) {
        throw new Error("No corporate strategy found in memory. Cannot extract growth targets.");
    }

    // 2. Synthesize Growth Targets via LLM
    const prompt = `You are a Chief Strategy Officer extracting actionable growth targets from the corporate strategy.

CURRENT CORPORATE STRATEGY:
${JSON.stringify(strategy, null, 2)}

TASK:
Analyze the strategy and extract the specific target markets, Ideal Client Profile (ICP) attributes, and strategic goals for lead generation.

OUTPUT FORMAT:
Return a strictly valid JSON object matching this schema:
{
  "target_markets": ["Market 1", "Market 2"],
  "icp_attributes": {
     "company_size": "Description",
     "industry": "Description",
     "key_pain_points": ["Pain point 1"]
  },
  "strategic_goals": ["Goal 1", "Goal 2"]
}`;

    const response = await llm.generate(prompt, []);

    let newGrowthTargets: GrowthTargets;
    try {
        let jsonStr = response.message || response.thought || "";
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();

        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        const data = JSON.parse(jsonStr);
        newGrowthTargets = {
            target_markets: Array.isArray(data.target_markets) ? data.target_markets : [],
            icp_attributes: typeof data.icp_attributes === "object" ? data.icp_attributes : {},
            strategic_goals: Array.isArray(data.strategic_goals) ? data.strategic_goals : []
        };
    } catch (e: any) {
        throw new Error(`Failed to parse LLM response for growth targets: ${e.message}. Raw response: ${response.message}`);
    }

    return newGrowthTargets;
};
