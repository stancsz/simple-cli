import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { readStrategy } from "./strategy.js";
import { scanStrategicHorizon } from "./scan_strategic_horizon.js";
import { getFleetStatusLogic } from "../../business_ops/tools/swarm_fleet_management.js";
import { collectPerformanceMetrics } from "../../business_ops/tools/performance_analytics.js";
import { updateOperatingPolicyLogic } from "../../business_ops/tools/policy_engine.js";
import { BoardResolution } from "../../../brain/schemas.js";
import { randomUUID } from "crypto";

export const conveneBoardMeeting = async (
  episodic: EpisodicMemory,
  company: string = "default"
) => {
  const llm = createLLM();

  // 1. Gather Intelligence (State of the Union)
  const [strategy, horizonReport, fleetStatus, performanceMetrics] = await Promise.all([
    readStrategy(episodic, company),
    scanStrategicHorizon(episodic, company),
    getFleetStatusLogic(),
    collectPerformanceMetrics("last_quarter", company)
  ]);

  // 2. CFO Persona Analysis
  const cfoPrompt = `
  You are the Chief Financial Officer (CFO) of an autonomous AI agency.
  Review the following financial and operational data:

  FINANCIALS:
  ${JSON.stringify(performanceMetrics.financial, null, 2)}

  FLEET EFFICIENCY:
  ${JSON.stringify(performanceMetrics.delivery, null, 2)}

  FLEET STATUS:
  ${JSON.stringify(fleetStatus.map(s => ({ company: s.company, health: s.health, active_agents: s.active_agents })), null, 2)}

  TASK:
  Analyze financial health and operational efficiency. Identify any critical risks or resource misallocations.
  Provide a brief executive summary (max 3 sentences) and a recommendation (e.g., "Cut costs", "Invest in growth").
  `;

  const cfoAnalysis = await llm.generate(cfoPrompt, []);

  // 3. CSO Persona Analysis
  const csoPrompt = `
  You are the Chief Strategy Officer (CSO) of an autonomous AI agency.
  Review the current strategy and the strategic horizon scan:

  CURRENT STRATEGY:
  ${JSON.stringify(strategy, null, 2)}

  HORIZON REPORT:
  ${JSON.stringify(horizonReport, null, 2)}

  TASK:
  Analyze strategic alignment. Are we positioned to capture emerging opportunities? Are we vulnerable to threats?
  Provide a brief executive summary (max 3 sentences) and a recommendation (e.g., "Pivot to X", "Stay the course").
  `;

  const csoAnalysis = await llm.generate(csoPrompt, []);

  // 4. CEO Decision & Resolution
  const ceoPrompt = `
  You are the Chief Executive Officer (CEO) of an autonomous AI agency.
  You have convened a board meeting to review performance and strategy.

  INPUTS:
  - CFO Report: ${cfoAnalysis.message || cfoAnalysis.thought}
  - CSO Report: ${csoAnalysis.message || csoAnalysis.thought}
  - Current Policy Parameters: Min Margin 20%, Risk Tolerance Medium (Default assumptions)

  TASK:
  Synthesize these reports and make a final binding decision.
  1. Decide whether to MAINTAIN_STRATEGY or STRATEGIC_PIVOT.
  2. If a pivot is needed or performance is off-track, mandate specific policy parameter updates (e.g., lower margin to capture share, increase risk tolerance).
  3. Write the official meeting minutes.

  OUTPUT FORMAT:
  Return ONLY a valid JSON object matching this schema:
  {
    "decision": "MAINTAIN_STRATEGY" | "STRATEGIC_PIVOT",
    "rationale": "Explanation of the decision",
    "policy_updates": [
      {
        "parameter": "min_margin" | "risk_tolerance" | "max_agents_per_swarm",
        "value": number | string,
        "justification": "Why this change is needed"
      }
    ],
    "meeting_minutes": "Summary of the discussion and final resolution."
  }
  `;

  const ceoResponse = await llm.generate(ceoPrompt, []);
  let resolutionData: any;
  try {
      let jsonStr = ceoResponse.message || ceoResponse.thought || "";
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
      }
      resolutionData = JSON.parse(jsonStr);
  } catch (e: any) {
      throw new Error(`Failed to parse Board Resolution: ${e.message}`);
  }

  // 5. Execution
  const resolution: BoardResolution = {
      id: randomUUID(),
      timestamp: Date.now(),
      decision: resolutionData.decision,
      rationale: resolutionData.rationale,
      policy_updates: resolutionData.policy_updates || [],
      meeting_minutes: resolutionData.meeting_minutes
  };

  // Store Resolution
  await episodic.store(
      `board_meeting_${Date.now()}`,
      `Convene Board Meeting for ${company}`,
      JSON.stringify(resolution),
      ["corporate_governance", "board_meeting"],
      company,
      undefined,
      undefined,
      undefined,
      resolution.id,
      0,
      0,
      "board_meeting_minutes"
  );

  // Apply Policy Updates if any
  if (resolution.policy_updates.length > 0) {
      // Fetch current defaults to merge
      // For MVP, we construct the update args from the resolution.
      // We assume the CEO provides valid parameters.

      // We need to fetch the *current* policy description to append the update note, or just create a new one.
      const updateArgs: any = {
          name: `Policy Updated via Board Resolution ${resolution.id.substring(0, 8)}`,
          description: `Autonomous update mandated by Board Meeting. Rationale: ${resolution.rationale}`,
          company: company,
          // Defaults if not specified in updates (safe fallbacks)
          min_margin: 0.2,
          risk_tolerance: "medium",
          max_agents_per_swarm: 5
      };

      // Overlay updates
      for (const update of resolution.policy_updates) {
          if (["min_margin", "risk_tolerance", "max_agents_per_swarm"].includes(update.parameter)) {
              updateArgs[update.parameter] = update.value;
          }
      }

      await updateOperatingPolicyLogic(updateArgs);
  }

  return resolution;
};
