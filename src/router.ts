/**
 * MoE Router: Mix of Experts task routing
 * Routes tasks to appropriate model tiers based on complexity
 */

import { jsonrepair } from 'jsonrepair';
import { z } from 'zod';

// Tier definitions
export type Tier = 1 | 2 | 3 | 4 | 5;

export interface TierConfig {
  tier: Tier;
  role: string;
  model: string;
  provider: 'openai' | 'anthropic' | 'gemini';
}

export interface RoutingDecision {
  tier: Tier;
  complexity: number;
  contextRequired: 'high' | 'low';
  risk: 'high' | 'low';
  reasoning: string;
}

// Schema for Orchestrator's routing response
export const RoutingResponseSchema = z.object({
  complexity: z.number().min(1).max(10),
  contextRequired: z.enum(['high', 'low']),
  risk: z.enum(['high', 'low']),
  recommendedTier: z.number().min(1).max(5),
  reasoning: z.string()
});

// Default tier configurations
const DEFAULT_TIERS: Record<Tier, { role: string; defaultModel: string }> = {
  1: { role: 'Orchestrator / Architect', defaultModel: 'gpt-5.2-pro' },
  2: { role: 'Senior Engineer', defaultModel: 'gpt-5.2-codex' },
  3: { role: 'Junior Engineer', defaultModel: 'gpt-5-mini' },
  4: { role: 'Intern / Linter', defaultModel: 'gpt-5-nano' },
  5: { role: 'Safety / Utility', defaultModel: 'gemini-2.5-flash' }
};

// Load tier configuration from environment
export const loadTierConfig = (): Map<Tier, TierConfig> => {
  const tiers = new Map<Tier, TierConfig>();

  for (const tier of [1, 2, 3, 4, 5] as Tier[]) {
    const envModel = process.env[`MOE_TIER_${tier}_MODEL`];
    const model = envModel || DEFAULT_TIERS[tier].defaultModel;

    // Vercel AI SDK supports provider prefixes (e.g., "anthropic:claude-3", "google:gemini-pro")
    // Some tests/tools use slash separators ("anthropic/claude-3-opus"). Accept either.
    const provider = model.includes(':') || model.includes('/') ? model.split(/[:\/]/)[0] as any : 'openai';

    tiers.set(tier, {
      tier,
      role: DEFAULT_TIERS[tier].role,
      model,
      provider
    });
  }

  return tiers;
};

// Routing prompt template
const ROUTING_PROMPT = `You are a task router for an AI coding assistant. Analyze the following task and determine its complexity.

Respond ONLY with valid JSON in this exact format:
{
  "complexity": <1-10>,
  "contextRequired": "<high|low>",
  "risk": "<high|low>",
  "recommendedTier": <1-5>,
  "reasoning": "<brief explanation>"
}

Tier Guidelines:
- Tier 1: Complex architecture, critical decisions, multi-system refactoring
- Tier 2: Feature implementation, significant code changes, debugging complex issues
- Tier 3: Routine tasks, unit tests, boilerplate code, simple features
- Tier 4: Typo fixes, formatting, simple imports, trivial changes
- Tier 5: Basic text operations, summaries

Task to analyze:
`;

// Determine routing using Tier 1 orchestrator
export const routeTask = async (
  task: string,
  orchestratorCall: (prompt: string) => Promise<string>
): Promise<RoutingDecision> => {
  try {
    const response = await orchestratorCall(ROUTING_PROMPT + task);

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return getDefaultRouting(task);
    }

    try {
      const repaired = jsonrepair(jsonMatch[0]);
      const data = JSON.parse(repaired);

      // Fuzzy mapping for recommendedTier
      const tierValue = data.recommendedTier || data.tier || data.recommended_tier || 3;
      const complexityValue = data.complexity || 5;

      return {
        tier: (Math.max(1, Math.min(5, Number(tierValue)))) as Tier,
        complexity: Number(complexityValue),
        contextRequired: data.contextRequired === 'high' ? 'high' : 'low',
        risk: data.risk === 'high' ? 'high' : 'low',
        reasoning: data.reasoning || 'No reasoning provided'
      };
    } catch (e) {
      return getDefaultRouting(task);
    }
  } catch (error) {
    console.error('Routing error, using default:', error);
    return getDefaultRouting(task);
  }
};

// Fallback routing based on simple heuristics
const getDefaultRouting = (task: string): RoutingDecision => {
  const taskLower = task.toLowerCase();

  // Simple keyword-based routing
  if (taskLower.match(/refactor|architect|design|migrate|security|auth/)) {
    return { tier: 2, complexity: 7, contextRequired: 'high', risk: 'high', reasoning: 'Complex task keywords detected' };
  }

  if (taskLower.match(/implement|feature|add|create|build|debug/)) {
    return { tier: 2, complexity: 6, contextRequired: 'high', risk: 'low', reasoning: 'Implementation task detected' };
  }

  if (taskLower.match(/test|boilerplate|template|simple/)) {
    return { tier: 3, complexity: 4, contextRequired: 'low', risk: 'low', reasoning: 'Routine task detected' };
  }

  if (taskLower.match(/typo|fix|format|import|rename/)) {
    return { tier: 4, complexity: 2, contextRequired: 'low', risk: 'low', reasoning: 'Minor task detected' };
  }

  // Default to Tier 3
  return { tier: 3, complexity: 5, contextRequired: 'low', risk: 'low', reasoning: 'Default routing' };
};

// Format routing decision for logging
export const formatRoutingDecision = (decision: RoutingDecision, tiers: Map<Tier, TierConfig>): string => {
  const tierConfig = tiers.get(decision.tier);
  return `[Router] Tier ${decision.tier} (${tierConfig?.role}) | Complexity: ${decision.complexity}/10 | Model: ${tierConfig?.model}
         Reasoning: ${decision.reasoning}`;
};

export interface StrategyDecision {
  framework: 'simple' | 'aider';
  model: 'codex' | 'gemini' | 'claude';
  reasoning: string;
}

const STRATEGY_PROMPT = `You are a strategic AI task router.
Analyze the following task and decide on the best CLI framework and Model to use.

Frameworks:
- 'aider': Best for complex refactoring, multi-file edits, and "pair programming" style tasks.
- 'simple': Best for specific, isolated tasks, script generation, questions, or when "simple" is requested.

Models:
- 'codex': Best for raw code generation, simple scripts (OpenAI).
- 'gemini': Best for creative tasks, explanations, or fast responses (Google).
- 'claude': Best for complex reasoning, architecture, and large context (Anthropic).

Respond ONLY with valid JSON:
{
  "framework": "<simple|aider>",
  "model": "<codex|gemini|claude>",
  "reasoning": "<brief explanation>"
}

Task:
`;

export const routeTaskStrategy = async (
  task: string,
  orchestratorCall: (prompt: string) => Promise<string>
): Promise<StrategyDecision> => {
  try {
    const response = await orchestratorCall(STRATEGY_PROMPT + task);

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return getDefaultStrategy(task);

    const repaired = jsonrepair(jsonMatch[0]);
    const data = JSON.parse(repaired);

    return {
      framework: ['simple', 'aider'].includes(data.framework) ? data.framework : 'simple',
      model: ['codex', 'gemini', 'claude'].includes(data.model) ? data.model : 'codex',
      reasoning: data.reasoning || 'No reasoning'
    };
  } catch (err) {
    return getDefaultStrategy(task);
  }
};

const getDefaultStrategy = (task: string): StrategyDecision => {
  const t = task.toLowerCase();
  if (t.includes('aider') || t.includes('refactor') || t.includes('architect')) {
    return { framework: 'aider', model: 'claude', reasoning: 'Complex keywords detected' };
  }
  if (t.includes('write') || t.includes('script') || t.includes('codex')) {
      return { framework: 'simple', model: 'codex', reasoning: 'Code generation keywords' };
  }
  if (t.includes('gemini') || t.includes('explain')) {
      return { framework: 'simple', model: 'gemini', reasoning: 'Explanation keywords' };
  }
  return { framework: 'simple', model: 'codex', reasoning: 'Default fallback' };
};
