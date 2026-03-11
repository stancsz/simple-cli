import { createHash } from "crypto";
import { LLMCache } from "./cache.js";
import { Config } from "../config.js";
import { createLLM, LLMConfig } from "../llm.js";
import { logMetric } from "../logger.js";

// Cache for routing decisions to avoid scoring the same prompt multiple times
// Since this is process-local and quick, an in-memory Map suffices, or we can use the LLMCache
const memoryRoutingCache = new Map<string, string>();

export class ModelRouter {
  private config: NonNullable<Config["modelRouting"]>;
  private llmCache: LLMCache | null;

  constructor(config: NonNullable<Config["modelRouting"]>, llmCache: LLMCache | null) {
    this.config = config;
    this.llmCache = llmCache;
  }

  private getHash(prompt: string): string {
    return createHash("sha256").update(prompt).digest("hex");
  }

  private parseModelString(modelStr: string): LLMConfig {
    let [p, n] = modelStr.includes(":") ? modelStr.split(":") : ["openai", modelStr];
    if (p === "openai" && n.includes("deepseek")) p = "deepseek";
    if (p === "openai" && (n.includes("claude") || n.includes("sonnet"))) p = "anthropic";
    if (p === "openai" && (n.includes("gemini") || n.includes("flash"))) p = "google";
    return { provider: p, model: n };
  }

  async routeTask(system: string, history: any[]): Promise<LLMConfig> {
    const fullPrompt = system + "\n" + JSON.stringify(history);
    const hash = this.getHash(fullPrompt);

    let tier: "low" | "medium" | "high" = this.config.defaultTier;

    // Check in-memory routing cache
    if (memoryRoutingCache.has(hash)) {
      tier = memoryRoutingCache.get(hash) as "low" | "medium" | "high";
      logMetric('llm', 'llm_model_routing_hits', 1, { tier, cached: 'true' });
      return this.parseModelString(this.config.tiers[tier]);
    }

    // Since we need to score it, we extract the user's prompt (usually the last message)
    const lastUserMessage = history.filter((m) => m.role === "user").pop()?.content || "";

    // We instantiate a direct LLM call to score it, simulating the tool call
    // This avoids circular dependencies with the business_ops MCP server.
    const SCORING_MODEL = process.env.SCORING_MODEL || "google:gemini-2.0-flash-001";
    const scorerLlm = createLLM(SCORING_MODEL);
    scorerLlm.disableRouting = true; // Prevent infinite recursion

    const scoringPrompt = `You are a Model Router Assistant.
Your task is to analyze the following prompt and system context, and determine its complexity.

Score the complexity on a scale of 0.0 to 1.0:
- 0.0 to 0.3 (low): Simple parsing, formatting, extraction, summarization, or retrieving factual data. (Tier: 'low')
- 0.4 to 0.7 (medium): Standard conversational tasks, basic reasoning, drafting simple emails/documents. (Tier: 'medium')
- 0.8 to 1.0 (high): Complex reasoning, advanced coding, strategic planning, mathematical proofs, deep problem-solving. (Tier: 'high')

Analyze the prompt carefully.
Provide your response strictly in JSON format as follows:
{
  "score": <number>,
  "tier": <"low" | "medium" | "high">
}
`;

    try {
      const scoringHistory = [{ role: "user", content: `System Context: ${system || 'None'}\n\nTask Prompt: ${lastUserMessage}` }];
      const response = await scorerLlm.generate(scoringPrompt, scoringHistory);

      if (response.raw) {
        const jsonPart = response.raw.match(/\{[\s\S]*\}/)?.[0] || response.raw;
        const parsed = JSON.parse(jsonPart);
        if (['low', 'medium', 'high'].includes(parsed.tier)) {
          tier = parsed.tier;
        }
      }

      // Calculate hypothetical cost savings vs default routing
      const defaultModel = this.config.tiers[this.config.defaultTier];
      const selectedModel = this.config.tiers[tier];

      if (selectedModel !== defaultModel) {
        // Log a metric to indicate adaptive routing saved tokens/costs
        // (Rough estimation: low saves cost vs medium/high)
        let savingsEstimated = 0;
        if (tier === 'low' && this.config.defaultTier !== 'low') savingsEstimated = 100; // Arbitrary metric value
        if (savingsEstimated > 0) {
            logMetric('llm', 'llm_cost_savings_estimated', savingsEstimated, { selectedModel, defaultModel });
        }
      }

    } catch (e) {
      console.warn(`[ModelRouter] Failed to score task complexity, falling back to default tier (${this.config.defaultTier}): ${e}`);
    }

    memoryRoutingCache.set(hash, tier);
    logMetric('llm', 'llm_model_routing_hits', 1, { tier, cached: 'false' });

    const modelStr = this.config.tiers[tier];
    return this.parseModelString(modelStr);
  }
}
