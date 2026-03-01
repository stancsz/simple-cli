import { EpisodicMemory } from "../src/brain/episodic.js";
import { createLLM } from "../src/llm.js";
import { readStrategy } from "../src/mcp_servers/brain/tools/strategy.js";
import {
    monitorMarketSignals,
    evaluateEconomicRisk,
    triggerContingencyPlan
} from "../src/mcp_servers/brain/tools/market_shock.js";
import { dirname } from "path";

const baseDir = process.env.JULES_AGENT_DIR ? dirname(process.env.JULES_AGENT_DIR) : process.cwd();
const episodic = new EpisodicMemory(baseDir);
const llm = createLLM("default");

async function runMarketShockMonitor() {
    console.log("[Market Shock Monitor] Starting daily evaluation...");

    // 1. Fetch Market Signals
    console.log("[Market Shock Monitor] Fetching market signals...");
    const signals = await monitorMarketSignals();
    console.log(`[Market Shock Monitor] Signals retrieved. Macro inflation trend: ${signals.macro.inflation_trend}`);

    // 2. Read Strategy & Evaluate Risk
    const currentStrategy = await readStrategy(episodic, "default");
    console.log("[Market Shock Monitor] Evaluating economic risk against corporate strategy...");
    const riskAssessment = await evaluateEconomicRisk(signals, currentStrategy, llm);

    console.log(`[Market Shock Monitor] Risk Assessed: ${riskAssessment.risk_level.toUpperCase()}`);
    console.log(`[Market Shock Monitor] Vulnerability Score: ${riskAssessment.vulnerability_score}`);
    console.log(`[Market Shock Monitor] Rationale: ${riskAssessment.rationale}`);

    // 3. Trigger Contingency Plan (if Medium or High risk)
    if (riskAssessment.risk_level === "high" || riskAssessment.risk_level === "medium") {
        console.log(`[Market Shock Monitor] Triggering contingency plan for ${riskAssessment.risk_level} risk...`);
        const newStrategy = await triggerContingencyPlan(riskAssessment, currentStrategy, episodic, llm, "default");
        console.log("[Market Shock Monitor] Contingency plan executed. New strategic policies:");
        console.log(JSON.stringify(newStrategy.policies, null, 2));
    } else {
        console.log("[Market Shock Monitor] Risk is low. No contingency plan needed.");
    }

    console.log("[Market Shock Monitor] Daily evaluation complete.");
}

runMarketShockMonitor().catch((err) => {
    console.error("[Market Shock Monitor] Error during execution:", err);
    process.exit(1);
});
