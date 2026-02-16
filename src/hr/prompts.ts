export const analyzePerformancePrompt = (agentName: string, logSummaries: string) => `
You are a Senior Agent Manager. Review the following execution logs for the agent "${agentName}".
Identify patterns of failure, recurring errors, or inefficient behaviors.
If you find actionable improvements, draft a set of concise, high-impact instructions to be added to the agent's "Soul" (System Prompt).
Focus on:
1. Handling specific errors that occurred.
2. Improving tool usage.
3. Clarifying ambiguity.

Logs:
${logSummaries}

Return your response in JSON format:
{
  "analysis": "Brief analysis of performance",
  "improvement_needed": boolean,
  "suggested_instructions": "Markdown text of instructions to add/update"
}
`;

export const updateSoulPrompt = (agentName: string, currentSoul: string, analysis: string, newInstructions: string) => `
You are editing the "Soul" (System Instructions) for the agent "${agentName}".
Current Soul:
${currentSoul}

Analysis of recent performance:
${analysis}

New Instructions to Incorporate:
${newInstructions}

Task:
Merge the new instructions into the current soul.
- Keep existing useful instructions.
- Update or replace instructions that were causing errors.
- Ensure the tone is consistent.
- Output ONLY the new Soul content in Markdown. Do not wrap in JSON.
`;
