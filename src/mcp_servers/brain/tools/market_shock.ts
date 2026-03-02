import { EpisodicMemory } from "../../../brain/episodic.js";
import { LLM } from "../../../llm/index.js";
import { CorporateStrategy, CorporatePolicy } from "../../../brain/schemas.js";
import { readStrategy } from "./strategy.js";

export interface MarketSignals {
    sectors: Record<string, { performance: number; volatility: number }>;
    macro: {
        interest_rate_trend: "rising" | "stable" | "falling";
        inflation_trend: "rising" | "stable" | "falling";
        consumer_confidence: number;
    };
    timestamp: number;
}

export const monitorMarketSignals = async (): Promise<MarketSignals> => {
    // Generate mock market data simulating sector performance and macro indicators
    const sectors = ["tech", "retail", "finance", "healthcare", "energy"];

    const mockSectors: Record<string, { performance: number; volatility: number }> = {};
    for (const sector of sectors) {
        // Random performance between -10% and +10%
        mockSectors[sector] = {
            performance: (Math.random() * 20) - 10,
            // Random volatility between 1 and 10
            volatility: Math.random() * 9 + 1,
        };
    }

    // Introduce a mock downturn in the tech sector for testing if desired
    // mockSectors["tech"].performance = -15.5;

    const trends: ("rising" | "stable" | "falling")[] = ["rising", "stable", "falling"];
    const randomTrend = () => trends[Math.floor(Math.random() * trends.length)];

    return {
        sectors: mockSectors,
        macro: {
            interest_rate_trend: randomTrend(),
            inflation_trend: randomTrend(),
            consumer_confidence: Math.random() * 100
        },
        timestamp: Date.now()
    };
};

export interface RiskAssessment {
    risk_level: "low" | "medium" | "high";
    vulnerability_score: number;
    rationale: string;
}

export const evaluateEconomicRisk = async (
    marketSignals: MarketSignals,
    currentStrategy: CorporateStrategy | null,
    llm: LLM
): Promise<RiskAssessment> => {
    // We assume the agency's client base context can be derived from the strategy or we just rely on LLM logic
    // Alternatively we can use episodic memory to query client context, but the prompt says:
    // "Use the LLM to analyze if the agency's current client base (from Brain/Company Context) is exposed to the downturning sectors."

    const prompt = `You are the Chief Strategy Officer (CSO) analyzing a market shock report.

CURRENT CORPORATE STRATEGY (which implies our client base and focus):
${currentStrategy ? JSON.stringify(currentStrategy, null, 2) : "No existing strategy found. Assume a diversified tech/retail client base."}

MARKET SIGNALS:
${JSON.stringify(marketSignals, null, 2)}

TASK:
Calculate a 'market vulnerability score' (0-100, where 100 is most vulnerable) based on the exposure of our strategy's objectives and vision to the downturning sectors (those with negative performance and high volatility) and macro trends.
Determine the overall risk assessment level as "low" (0-30), "medium" (31-70), or "high" (71-100).
Provide a clear, brief rationale.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema:
{
  "risk_level": "low" | "medium" | "high",
  "vulnerability_score": number,
  "rationale": "String explaining the assessment"
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

        const data = JSON.parse(jsonStr);
        return {
            risk_level: data.risk_level || "low",
            vulnerability_score: typeof data.vulnerability_score === 'number' ? data.vulnerability_score : 0,
            rationale: data.rationale || "Failed to parse rationale."
        };
    } catch (e: any) {
        console.error("[Brain] Error parsing risk assessment LLM response:", e);
        return {
            risk_level: "low",
            vulnerability_score: 0,
            rationale: "Default fallback due to parsing error."
        };
    }
};

export const triggerContingencyPlan = async (
    riskAssessment: RiskAssessment,
    currentStrategy: CorporateStrategy | null,
    episodic: EpisodicMemory,
    llm: LLM,
    company?: string
): Promise<CorporateStrategy> => {

    const prompt = `You are the CEO and CSO of an autonomous AI agency. We have just detected a market shock.

CURRENT STRATEGY:
${currentStrategy ? JSON.stringify(currentStrategy, null, 2) : "No existing strategy. Operating generically."}

RISK ASSESSMENT:
${JSON.stringify(riskAssessment, null, 2)}

TASK:
Based on the risk level (${riskAssessment.risk_level}) and the rationale, decide on an adaptive operating policy.
If the risk is "high", you must trigger aggressive contingencies (e.g., "pause_non_critical_swarms": true, "adjust_pricing_margin": -0.15).
If the risk is "medium", trigger moderate adjustments (e.g., "tighten_hiring": true, "adjust_pricing_margin": -0.05).
If the risk is "low", maintain course (no major contingency needed).

You are updating the Corporate Strategy. Keep the vision and objectives largely intact, but append/modify the "policies" object to reflect these contingency measures. Also, add a new objective acknowledging the defensive stance if necessary.
Provide a brief rationale for the changes.

OUTPUT FORMAT:
Return ONLY a valid JSON object matching this schema (identical to CorporateStrategy):
{
  "vision": "String describing the vision",
  "objectives": ["Array", "of", "objectives"],
  "policies": { "key": "value" },
  "rationale": "Brief explanation of the contingency plan"
}
`;

    const response = await llm.generate(prompt, []);

    let newStrategyData: any;
    try {
        let jsonStr = response.message || response.thought || "";
        jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();

        const firstBrace = jsonStr.indexOf("{");
        const lastBrace = jsonStr.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
            jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        newStrategyData = JSON.parse(jsonStr);
    } catch (e: any) {
        throw new Error(`Failed to parse LLM response for contingency strategy: ${e.message}. Raw response: ${response.message}`);
    }

    const newStrategy: CorporateStrategy = {
        vision: newStrategyData.vision || currentStrategy?.vision || "Default Vision",
        objectives: Array.isArray(newStrategyData.objectives) ? newStrategyData.objectives : currentStrategy?.objectives || [],
        policies: newStrategyData.policies || currentStrategy?.policies || {},
        timestamp: Date.now()
    };

    const taskId = `contingency_plan_${Date.now()}`;
    await episodic.store(
        taskId,
        `Market Risk Level: ${riskAssessment.risk_level}. Rationale: ${riskAssessment.rationale}`,
        JSON.stringify(newStrategy),
        ["corporate_governance", "market_shock", "phase_27"],
        company,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        "corporate_strategy"
    );

    return newStrategy;
};
