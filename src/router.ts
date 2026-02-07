/**
 * Task Router: Routes tasks to appropriate models based on complexity.
 */

import { jsonrepair } from 'jsonrepair';

export interface StrategyDecision {
  model: string;
  reasoning: string;
}

const STRATEGY_PROMPT = `You are a strategic AI task router.
Analyze the following task and decide on the best Model to use.

Choose from the following models:
- 'openai:gpt-5.1-codex-mini': For simple coding tasks, small refactors, docs, or simple questions.
- 'openai:gpt-5.2-codex': For complex coding tasks, architecture changes, debugging hard issues, or large refactors.
- 'google:gemini-pro': For creative writing, explanations, or if the user asks for Gemini.
- 'anthropic:claude-3-opus': For complex reasoning, large context analysis, or if the user asks for Claude.

Respond ONLY with valid JSON:
{
  "model": "<model_id>",
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
      model: data.model || 'openai:gpt-5.1-codex-mini',
      reasoning: data.reasoning || 'No reasoning'
    };
  } catch (err) {
    return getDefaultStrategy(task);
  }
};

const getDefaultStrategy = (task: string): StrategyDecision => {
  const t = task.toLowerCase();
  if (t.includes('gemini')) return { model: 'google:gemini-pro', reasoning: 'User requested Gemini' };
  if (t.includes('claude')) return { model: 'anthropic:claude-3-opus', reasoning: 'User requested Claude' };
  if (t.includes('complex') || t.includes('architect') || t.includes('refactor') || t.length > 200) {
      return { model: 'openai:gpt-5.2-codex', reasoning: 'Complex task heuristics' };
  }
  return { model: 'openai:gpt-5.1-codex-mini', reasoning: 'Default simple model' };
};
