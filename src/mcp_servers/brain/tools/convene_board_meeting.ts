import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm.js";
import { readStrategy, proposeStrategicPivot } from "./strategy.js";
import { scanStrategicHorizon } from "./scan_strategic_horizon.js";
import { getFleetStatusLogic } from "../../business_ops/tools/swarm_fleet_management.js";
import { collectPerformanceMetrics } from "../../business_ops/tools/performance_analytics.js";
import { updateOperatingPolicyLogic } from "../../business_ops/tools/policy_engine.js";
import { CSO_PROMPT, CFO_PROMPT, CEO_PROMPT } from "../board_prompts.js";
import { dirname } from "path";

// Helper to sanitize JSON strings from LLM output
const extractJSON = (text: string) => {
    let jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
    return JSON.parse(jsonStr);
};

export function registerBoardMeetingTools(server: McpServer) {
    // Initialize Episodic Memory
    const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
    const episodic = new EpisodicMemory(baseDir);

    server.tool(
        "convene_board_meeting",
        "Simulates a board meeting where C-Suite personas review agency performance and make strategic decisions.",
        {
            company: z.string().optional().describe("The company/client identifier for namespacing."),
            dry_run: z.boolean().default(false).describe("If true, simulates the meeting without executing binding decisions.")
        },
        async ({ company, dry_run }) => {
            const llm = createLLM();
            const logs: string[] = [];
            const companyId = company || "default";

            logs.push(" convening board meeting...");

            // 1. Aggregate State of the Union
            logs.push("Aggregating State of the Union data...");

            // Parallel data fetching for efficiency
            const [fleetStatus, metrics, strategy, horizonReport] = await Promise.all([
                getFleetStatusLogic(), // returns PolicyCompliantFleetStatus[]
                collectPerformanceMetrics("last_30_days", companyId),
                readStrategy(episodic, companyId),
                scanStrategicHorizon(episodic, companyId)
            ]);

            const stateOfTheUnion = {
                fleet_status: fleetStatus,
                performance_metrics: metrics,
                current_strategy: strategy,
                strategic_horizon: horizonReport,
                timestamp: new Date().toISOString()
            };

            const contextData = JSON.stringify(stateOfTheUnion, null, 2);

            // 2. Persona Simulation (Sequential Deliberation)

            // Round 1: CSO Analysis
            logs.push("Simulating CSO analysis...");
            const csoResponse = await llm.generate(CSO_PROMPT, [
                { role: "user", content: `STATE OF THE UNION DATA:\n${contextData}` }
            ]);
            const csoAnalysis = csoResponse.message || csoResponse.thought || "No analysis provided.";

            // Round 2: CFO Analysis (Input includes CSO's analysis)
            logs.push("Simulating CFO analysis...");
            const cfoResponse = await llm.generate(CFO_PROMPT, [
                { role: "user", content: `STATE OF THE UNION DATA:\n${contextData}\n\nCSO ANALYSIS:\n${csoAnalysis}` }
            ]);
            const cfoAnalysis = cfoResponse.message || cfoResponse.thought || "No analysis provided.";

            // Round 3: CEO Decision (Input includes CSO + CFO)
            logs.push("Simulating CEO decision...");
            const ceoResponse = await llm.generate(CEO_PROMPT, [
                { role: "user", content: `STATE OF THE UNION DATA:\n${contextData}\n\nCSO ANALYSIS:\n${csoAnalysis}\n\nCFO ANALYSIS:\n${cfoAnalysis}` }
            ]);

            let decisionData;
            try {
                decisionData = extractJSON(ceoResponse.message || ceoResponse.thought || "{}");
            } catch (e) {
                logs.push(`Error parsing CEO decision: ${(e as Error).message}`);
                decisionData = { decision: "no_action", rationale: "Failed to parse CEO decision." };
            }

            // 3. Execution
            logs.push(`Board Decision: ${decisionData.decision}`);

            if (!dry_run) {
                try {
                    if (decisionData.decision === "strategic_pivot") {
                        const proposal = decisionData.action_payload?.proposal || "Strategic Pivot initiated by Board.";
                        await proposeStrategicPivot(episodic, llm, proposal, companyId);
                        logs.push("Executed Strategic Pivot.");
                    } else if (decisionData.decision === "policy_update") {
                        const payload = decisionData.action_payload;
                        if (payload) {
                            await updateOperatingPolicyLogic(
                                episodic,
                                payload.policy_name || "Board Mandated Policy",
                                payload.description || "Updated via Board Meeting",
                                payload.min_margin || 0.2,
                                payload.risk_tolerance || "medium",
                                payload.max_agents_per_swarm || 5,
                                companyId
                            );
                            logs.push("Executed Policy Update.");
                        } else {
                            logs.push("Warning: Policy update payload missing.");
                        }
                    } else {
                        logs.push("No binding action taken.");
                    }
                } catch (e) {
                     logs.push(`Execution Error: ${(e as Error).message}`);
                }
            } else {
                logs.push("Dry run enabled: Skipping execution.");
            }

            // 4. Store Meeting Minutes
            const meetingMinutes = {
                timestamp: Date.now(),
                participants: ["CEO", "CFO", "CSO"],
                agenda: "State of the Union Review",
                deliberation: {
                    cso_analysis: csoAnalysis,
                    cfo_analysis: cfoAnalysis,
                    ceo_decision: decisionData
                },
                outcome: decisionData.decision,
                executed: !dry_run
            };

            await episodic.store(
                `board_meeting_${Date.now()}`,
                "Convene Autonomous Board Meeting",
                JSON.stringify(meetingMinutes),
                [],
                companyId,
                undefined,
                undefined,
                undefined,
                undefined,
                0, // tokens (placeholder)
                0, // duration
                "board_meeting"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "success",
                        logs,
                        meeting_minutes: meetingMinutes
                    }, null, 2)
                }]
            };
        }
    );
}
