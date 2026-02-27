import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { readStrategy, proposeStrategicPivot } from "./strategy.js";
import { scanStrategicHorizon } from "./scan_strategic_horizon.js";
import { getFleetStatusLogic } from "../../business_ops/tools/swarm_fleet_management.js";
import { collectPerformanceMetrics } from "../../business_ops/tools/performance_analytics.js";
import { updateOperatingPolicyLogic, getLatestPolicy } from "../../business_ops/tools/policy_engine.js";
import { BOARD_MEETING_ORCHESTRATOR_PROMPT, CEO_PROMPT, CFO_PROMPT, CSO_PROMPT } from "../board_prompts.js";
import { randomUUID } from "crypto";

export interface BoardMeetingMinutes {
    meeting_id: string;
    timestamp: string;
    attendees: string[];
    summary: string;
    decisions: {
        type: "strategic_pivot" | "policy_update" | "maintain_course";
        description: string;
    }[];
    new_strategy?: {
        vision: string;
        objectives: string[];
        policies: Record<string, any>;
    };
    policy_updates?: {
        min_margin?: number;
        risk_tolerance?: "low" | "medium" | "high";
        max_agents_per_swarm?: number;
        [key: string]: any;
    };
}

/**
 * Orchestrates an Autonomous Board Meeting.
 *
 * Workflow:
 * 1. **Gather Intelligence**: Fleet Status, Performance Metrics, Horizon Scan.
 * 2. **Deliberate**: Use LLM with C-Suite personas (CEO, CFO, CSO) to review data.
 * 3. **Decide**: Generate a Board Resolution (Strategic Pivot / Policy Update).
 * 4. **Execute**: Call `proposeStrategicPivot` and `updateOperatingPolicyLogic` if needed.
 * 5. **Record**: Store minutes in Episodic Memory.
 */
export const conveneBoardMeeting = async (
    episodic: EpisodicMemory,
    company?: string
): Promise<BoardMeetingMinutes> => {
    const llm = createLLM();

    // 1. Gather Intelligence (Parallel)
    const [fleetStatus, performanceMetrics, horizonScan, currentStrategy, currentPolicy] = await Promise.all([
        getFleetStatusLogic(),
        collectPerformanceMetrics("last_quarter", company),
        scanStrategicHorizon(episodic, company),
        readStrategy(episodic, company),
        getLatestPolicy(episodic, company)
    ]);

    // 2. Deliberate & Decide (LLM Orchestration)
    // We construct a single prompt that includes the persona instructions and the data.
    // In a more complex system, we might have multi-turn dialogue, but for efficiency, we use one detailed prompt.
    const context = `
    FINANCIAL REPORT (CFO Input):
    ${JSON.stringify(performanceMetrics.financial, null, 2)}

    FLEET STATUS (COO Input):
    Active Swarms: ${fleetStatus.length}
    Health: ${fleetStatus.map(s => `${s.company}: ${s.health}`).join(", ")}

    STRATEGIC HORIZON (CSO Input):
    ${JSON.stringify(horizonScan, null, 2)}

    CURRENT STRATEGY:
    ${currentStrategy ? JSON.stringify(currentStrategy, null, 2) : "None"}

    CURRENT POLICY:
    ${currentPolicy ? JSON.stringify(currentPolicy, null, 2) : "None"}
    `;

    const prompt = `
    ${BOARD_MEETING_ORCHESTRATOR_PROMPT}

    CONTEXT:
    ${context}
    `;

    const response = await llm.generate(prompt, []);

    let minutes: BoardMeetingMinutes;
    try {
        let jsonStr = response.message || response.thought || "";
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }
        minutes = JSON.parse(jsonStr);
        // Ensure ID and Timestamp are set
        minutes.meeting_id = minutes.meeting_id || randomUUID();
        minutes.timestamp = minutes.timestamp || new Date().toISOString();
    } catch (e: any) {
        throw new Error(`Failed to parse Board Meeting Minutes: ${e.message}`);
    }

    // 4. Execute Decisions
    // Strategic Pivot
    if (minutes.new_strategy) {
        // We use the `proposeStrategicPivot` logic but bypass the LLM generation part since we already have the strategy object.
        // Wait, `proposeStrategicPivot` takes a string proposal and uses LLM.
        // We should just store the strategy directly if we have the full object, or adapt `proposeStrategicPivot`.
        // To stick to the "tool" interface, we can call `proposeStrategicPivot` with the description,
        // OR simply store it directly since the Board is the highest authority.
        // Let's store directly to be precise, reusing the schema.
        await episodic.store(
            `strategy_update_${randomUUID()}`,
            `Board Meeting Decision: Update Strategy`,
            JSON.stringify(minutes.new_strategy),
            ["corporate_governance", "strategy", "board_meeting"],
            company,
            undefined, undefined, undefined, undefined, 0, 0, "corporate_strategy"
        );
    }

    // Policy Update
    if (minutes.policy_updates && Object.keys(minutes.policy_updates).length > 0) {
        // Construct description
        const changes = Object.entries(minutes.policy_updates)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");

        // Merge with current policy defaults if needed, but `updateOperatingPolicyLogic` handles partial updates?
        // No, `updateOperatingPolicyLogic` expects full params in the interface, but we can merge.
        const basePolicy = currentPolicy || {
            name: "Global Operating Policy",
            description: "Standard operating parameters",
            parameters: {
                min_margin: 0.2,
                risk_tolerance: "medium",
                max_agents_per_swarm: 5
            }
        };

        const mergedParams = {
            name: basePolicy.name, // Keep existing name
            description: `Board Update: ${changes}`,
            min_margin: minutes.policy_updates.min_margin ?? basePolicy.parameters.min_margin,
            risk_tolerance: (minutes.policy_updates.risk_tolerance as any) ?? basePolicy.parameters.risk_tolerance,
            max_agents_per_swarm: minutes.policy_updates.max_agents_per_swarm ?? basePolicy.parameters.max_agents_per_swarm,
            company
        };

        await updateOperatingPolicyLogic(episodic, mergedParams);
    }

    // 5. Record Minutes
    await episodic.store(
        `board_meeting_${minutes.meeting_id}`,
        `Autonomous Board Meeting (${new Date().toLocaleDateString()})`,
        JSON.stringify(minutes),
        ["corporate_governance", "board_minutes"],
        company,
        undefined, undefined, undefined, minutes.meeting_id,
        0, 0, "board_meeting_minutes"
    );

    return minutes;
};
