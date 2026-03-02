import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EpisodicMemory } from "../../../brain/episodic.js";
import { createLLM } from "../../../llm/index.js";
import { readStrategy } from "../../brain/tools/strategy.js";
import { CorporatePolicy } from "../../../brain/schemas.js";
import { randomUUID } from "crypto";

// Exported tool registration function
export function registerShockAbsorptionTools(server: McpServer) {
    server.tool(
        "monitor_market_signals",
        "Monitors market data for economic downturns, inflation, or industry-specific shocks.",
        {
            sector: z.string().describe("The business sector to monitor (e.g., 'Software Development')."),
            region: z.string().describe("The region (e.g., 'US', 'Global')."),
            company: z.string().optional().default("default").describe("Company ID for context.")
        },
        async ({ sector, region, company }) => {
            // Memory setup to save the signals
            const memory = new EpisodicMemory();
            await memory.init();

            // 1. Fetch Mock/Stubbed Data
            // In a production environment, this would call real market APIs (Bloomberg, FRED, Statista, etc.)
            // Here, we provide realistic structured signals that simulate an economic downturn or shift.
            const marketSignals = {
                timestamp: new Date().toISOString(),
                sector,
                region,
                macro_indicators: {
                    inflation_rate: 4.5, // High inflation
                    interest_rate_trend: "increasing",
                    gdp_growth_estimate: -0.2 // Slight contraction
                },
                sector_indicators: {
                    tech_layoffs_index: 85, // 0-100 scale, high means more layoffs
                    vc_funding_volume_change_yoy: -30, // 30% drop in VC funding
                    average_sales_cycle_length_days: 120 // Increased sales cycles
                },
                sentiment_analysis: "Bearish"
            };

            // 2. Store the signals in Memory so the evaluate tool can access it
            const memoryId = `market_signals_${Date.now()}`;
            await memory.store(
                memoryId,
                `Market signals for ${sector} in ${region}`,
                JSON.stringify(marketSignals),
                ["market_shock", "macroeconomics", "signals"],
                company,
                undefined,
                false,
                undefined,
                undefined,
                0,
                0,
                "market_signals"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "success",
                        message: "Market signals recorded successfully.",
                        data: marketSignals
                    }, null, 2)
                }]
            };
        }
    );

    server.tool(
        "evaluate_economic_risk",
        "Analyzes market signals against corporate strategy to assess economic risk.",
        {
            company: z.string().optional().default("default").describe("Company ID for context.")
        },
        async ({ company }) => {
            const memory = new EpisodicMemory();
            await memory.init();
            const llm = createLLM();

            // 1. Get Market Signals
            const signalsMemory = await memory.recall("market signals", 1, company, "market_signals");
            if (!signalsMemory || signalsMemory.length === 0) {
                return {
                    content: [{ type: "text", text: "No recent market signals found to evaluate." }]
                };
            }
            const latestSignals = signalsMemory[0].agentResponse;

            // 2. Get Corporate Strategy
            const currentStrategy = await readStrategy(memory, company);
            const strategyContext = currentStrategy ? JSON.stringify(currentStrategy) : "No specific strategy found.";

            // 3. Evaluate with LLM
            const prompt = `Act as a Chief Risk Officer. Analyze the latest market signals against our current corporate strategy.

Market Signals:
${latestSignals}

Our Current Corporate Strategy:
${strategyContext}

Task: Evaluate the economic risk level and identify specific vulnerabilities based on our strategy.
Return a valid JSON object matching this structure:
{
  "risk_level": "Low" | "Medium" | "High" | "Critical",
  "vulnerabilities": ["string"],
  "recommended_actions": ["string"],
  "rationale": "string"
}`;

            const response = await llm.generate(prompt, []);
            const jsonMatch = response.message?.match(/\{[\s\S]*\}/);
            const evaluation = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Failed to generate evaluation", raw: response.message };

            // Store evaluation in Memory
            await memory.store(
                `economic_risk_eval_${Date.now()}`,
                `Economic risk evaluation based on latest market signals`,
                JSON.stringify(evaluation),
                ["market_shock", "risk_evaluation"],
                company,
                undefined,
                false,
                undefined,
                undefined,
                0,
                0,
                "economic_risk_evaluation"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(evaluation, null, 2)
                }]
            };
        }
    );

    server.tool(
        "trigger_contingency_plan",
        "Executes a pre-defined response strategy via the Policy Engine based on risk evaluation.",
        {
            company: z.string().optional().default("default").describe("Company ID for context.")
        },
        async ({ company }) => {
            const memory = new EpisodicMemory();
            await memory.init();

            // 1. Get latest Risk Evaluation
            const evaluationMemory = await memory.recall("economic risk evaluation", 1, company, "economic_risk_evaluation");
            if (!evaluationMemory || evaluationMemory.length === 0) {
                return {
                    content: [{ type: "text", text: "No recent risk evaluation found to trigger contingency." }]
                };
            }

            let evaluation;
            try {
                evaluation = JSON.parse(evaluationMemory[0].agentResponse);
            } catch (e) {
                return { content: [{ type: "text", text: "Failed to parse risk evaluation memory." }], isError: true };
            }

            // 2. Check risk level
            if (evaluation.risk_level === "Low" || evaluation.risk_level === "Medium") {
                return {
                    content: [{ type: "text", text: `Risk level is ${evaluation.risk_level}. No contingency plan triggered.` }]
                };
            }

            // 3. Trigger Contingency (Risk is High or Critical)
            // Fetch current policy
            // Fix: Filter by type manually to avoid semantic search returning older/unrelated memories
            const rawMemories = await memory.recall("corporate_policy", 10, company);
            const policyMemories = rawMemories
                .filter(m => m.type === "corporate_policy")
                .sort((a, b) => b.timestamp - a.timestamp);

            let newVersion = 1;
            let previousId = undefined;
            let minMargin = 0.2;
            let maxAgents = 5;

            if (policyMemories.length > 0) {
                try {
                    const currentPolicy = JSON.parse(policyMemories[0].agentResponse) as CorporatePolicy;
                    newVersion = currentPolicy.version + 1;
                    previousId = currentPolicy.id;
                    minMargin = currentPolicy.parameters?.min_margin || 0.2;
                    maxAgents = currentPolicy.parameters?.max_agents_per_swarm || 5;
                } catch (e) {
                    // Ignore parsing errors, fallback to defaults
                }
            }

            // Apply strict contingency adjustments based on risk level
            const newMinMargin = evaluation.risk_level === "Critical" ? Math.max(0.4, minMargin + 0.2) : Math.max(0.3, minMargin + 0.1);
            const newRiskTolerance = "low";
            const newMaxAgents = Math.max(1, maxAgents - 2); // Reduce workforce scale

            const newPolicy: CorporatePolicy = {
                id: randomUUID(),
                version: newVersion,
                name: `Contingency Operating Policy - Risk Level: ${evaluation.risk_level}`,
                description: `Emergency policy update triggered by Market Shock Absorption. Rationale: ${evaluation.rationale || "High/Critical market risk detected."}`,
                parameters: {
                    min_margin: newMinMargin,
                    risk_tolerance: newRiskTolerance,
                    max_agents_per_swarm: newMaxAgents
                },
                isActive: true,
                timestamp: Date.now(),
                author: "Market Shock Absorption System",
                previous_version_id: previousId
            };

            // 4. Store the new policy in Episodic Memory for the Policy Engine to pick up
            await memory.store(
                `policy_update_contingency_v${newVersion}`,
                `Trigger contingency policy to version ${newVersion}: ${newPolicy.description}`,
                JSON.stringify(newPolicy),
                ["market_shock", "contingency", "corporate_policy"],
                company,
                undefined,
                undefined,
                undefined,
                newPolicy.id,
                0,
                0,
                "corporate_policy"
            );

            return {
                content: [{
                    type: "text",
                    text: JSON.stringify({
                        status: "success",
                        message: `Contingency plan triggered for risk level ${evaluation.risk_level}. New policy version ${newVersion} created.`,
                        policy: newPolicy
                    }, null, 2)
                }]
            };
        }
    );
}
