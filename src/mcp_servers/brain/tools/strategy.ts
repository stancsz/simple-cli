import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { LLM } from "../../../llm.js";

// Define the schema interface here or import it if you have it in schemas.ts
// Assuming schemas.ts exists based on the plan, let's import it.
import { CorporateStrategy } from "../../../brain/schemas.js";

/**
 * Retrieves the latest corporate strategy from episodic memory.
 */
export const readStrategy = async (
  episodic: EpisodicMemory,
  company?: string
): Promise<CorporateStrategy | null> => {
  try {
    // 1. Query for memories of type 'corporate_strategy'
    // We use a broad query to find relevant entries.
    // The "current corporate strategy" text will be embedded and compared.
    const memories = await episodic.recall(
      "current corporate strategy",
      10, // Fetch up to 10 candidates to find the latest
      company,
      "corporate_strategy" // Filter by type
    );

    if (!memories || memories.length === 0) {
      return null;
    }

    // 2. Sort by timestamp descending (newest first)
    // The 'recall' method returns `PastEpisode[]`, which has a `timestamp` field.
    const sortedMemories = memories.sort((a, b) => b.timestamp - a.timestamp);

    // 3. Parse the latest one
    const latestMemory = sortedMemories[0];

    // The strategy JSON is stored in the 'agentResponse' (solution) field
    const strategyJson = latestMemory.agentResponse;

    // Attempt to parse JSON
    const strategy = JSON.parse(strategyJson);

    // Basic validation
    if (!strategy.vision || !Array.isArray(strategy.objectives)) {
        console.warn(`[Brain] Invalid strategy schema in memory ${latestMemory.id}`);
        return null;
    }

    return strategy as CorporateStrategy;
  } catch (error) {
    console.error("[Brain] Error reading strategy:", error);
    return null;
  }
};

/**
 * Proposes a strategic pivot, generates a new strategy using LLM, and stores it.
 */
export const proposeStrategicPivot = async (
  episodic: EpisodicMemory,
  llm: LLM,
  proposal: string,
  company?: string
): Promise<CorporateStrategy> => {
  // 1. Get current strategy for context
  const currentStrategy = await readStrategy(episodic, company);

  // 2. Construct Prompt for LLM
  const prompt = `You are the Chief Strategy Officer (CSO) of an autonomous AI agency.

CURRENT CORPORATE STRATEGY:
${currentStrategy ? JSON.stringify(currentStrategy, null, 2) : "No existing strategy found. This is the initial formulation."}

NEW STRATEGIC PROPOSAL:
"${proposal}"

TASK:
Analyze the proposal against the current strategy. If the proposal is valid and beneficial, evolve the corporate strategy to incorporate it.
Ensure the new strategy is coherent, actionable, and forward-looking.
If the proposal contradicts core values or is harmful, reject it by maintaining the old strategy (but you must still output the valid JSON structure).

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "vision": "String describing the high-level vision",
  "objectives": ["Array", "of", "strategic", "objectives"],
  "policies": { "key": "value (operational guidelines)" },
  "rationale": "Brief explanation of why this strategy was chosen/updated"
}
`;

  // 3. Generate with LLM
  const response = await llm.generate(prompt, []); // No history needed for this atomic task

  let newStrategyData: any;
  try {
      // Clean up markdown code blocks if present
      let jsonStr = response.message || response.thought || "";
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();

      // Extract JSON object
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }

      newStrategyData = JSON.parse(jsonStr);
  } catch (e: any) {
      throw new Error(`Failed to parse LLM response for strategy: ${e.message}. Raw response: ${response.message}`);
  }

  // 4. Construct Final Strategy Object
  const newStrategy: CorporateStrategy = {
      vision: newStrategyData.vision || "No vision provided",
      objectives: Array.isArray(newStrategyData.objectives) ? newStrategyData.objectives : [],
      policies: newStrategyData.policies || {},
      timestamp: Date.now()
  };

  // 5. Store in Brain
  // We store the JSON string in 'solution' (agentResponse)
  // We store the proposal in 'request' (userPrompt)
  await episodic.store(
      `strategy_update_${Date.now()}`, // taskId
      `Strategic Proposal: ${proposal}`, // request
      JSON.stringify(newStrategy), // solution
      ["corporate_governance", "strategy", "phase_25"], // artifacts (tags)
      company, // company
      undefined, // simulation_attempts
      undefined, // resolved_via_dreaming
      undefined, // dreaming_outcomes
      undefined, // id
      undefined, // tokens
      undefined, // duration
      "corporate_strategy" // type - CRITICAL for retrieval
  );

  return newStrategy;
};

export const proposeEcosystemPolicyUpdate = async (
  episodic: EpisodicMemory,
  llm: LLM,
  ecosystemAnalysis: any
): Promise<any> => {
  // 1. Get current strategy for context
  const currentStrategy = await readStrategy(episodic, "default");

  const prompt = `
  You are the Ecosystem Intelligence Policy Engine for the root AI agency.
  Your task is to review the latest Ecosystem Pattern Analysis and draft proposed updates to the global operating policy or corporate strategy.

  ECOSYSTEM ANALYSIS REPORT:
  ${JSON.stringify(ecosystemAnalysis, null, 2)}

  CURRENT CORPORATE STRATEGY:
  ${currentStrategy ? JSON.stringify(currentStrategy, null, 2) : "No existing strategy found."}

  Draft a proposed update to the strategy or operating policy intended to be propagated to child agencies (e.g., "All design-focused child agencies should adopt Visual Quality Gate v2").
  The proposal should be clear, actionable, and address the bottlenecks or scale the success themes identified in the report.
  The proposal will be passed to the 'proposeStrategicPivot' tool for formal adoption.

  OUTPUT FORMAT:
  Return ONLY a valid JSON object matching this schema:
  {
    "proposal": "A clear, actionable statement of the proposed strategic pivot or policy rule",
    "rationale": "Brief explanation connecting the proposal directly to the ecosystem analysis",
    "scope": "ecosystem"
  }
  `;

  const response = await llm.generate(prompt, []);

  let proposalData: any;
  try {
      let jsonStr = response.message || response.thought || "";
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      proposalData = JSON.parse(jsonStr);
  } catch (e: any) {
      throw new Error(`Failed to parse LLM response for ecosystem policy update: ${e.message}. Raw response: ${response.message}`);
  }

  // Submit the proposed update via proposeStrategicPivot to follow standard governance
  const pivotResult = await proposeStrategicPivot(episodic, llm, proposalData.proposal, "default");

  // Since proposeStrategicPivot stores it as "corporate_strategy", we explicitly
  // log a secondary memory as "ecosystem_policy" so the orchestrator can target it uniquely.
  await episodic.store(
      `ecosystem_policy_${Date.now()}`,
      `Ecosystem Policy Update: ${proposalData.proposal}`,
      JSON.stringify(pivotResult),
      ["ecosystem_policy", "strategy", "phase_35"],
      "default",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "ecosystem_policy"
  );

  return {
      ecosystem_proposal: proposalData,
      pivot_result: pivotResult
  };
};
