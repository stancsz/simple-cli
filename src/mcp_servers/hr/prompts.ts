export const analyzePerformancePrompt = (logSummaries: string, pastExperiences: string) => `
You are the "HR Loop" system for an autonomous coding agent. Your job is to analyze execution logs and past experiences to identify systemic issues and propose concrete improvements.

Review the following:
1. Recent Execution Logs:
${logSummaries}

2. Relevant Past Experiences (Memory):
${pastExperiences}

Task:
Identify patterns of failure, recurring errors, or inefficient behaviors.
If you find actionable improvements, propose a specific change. The change can be:
- An update to the agent's system prompt (Soul).
- A modification to a specific source file (e.g., to fix a buggy tool or logic).
- A configuration change.

Focus on:
1. Handling specific errors that occurred.
2. Improving tool usage.
3. Preventing recurrence of known issues.

Return your response in this JSON format:
{
  "analysis": "Brief analysis of the performance issues and patterns identified.",
  "improvement_needed": boolean,
  "title": "Short title for the proposal (e.g., 'Fix error handling in X')",
  "description": "Detailed description of the problem and the proposed fix.",
  "affected_files": ["file1.ts", "file2.md"],
  "patch": "The specific content to add/change. If it's a file modification, provide a git diff or clear instructions. If it's a prompt update, provide the new text."
}
`;

export const analyzeCrossSwarmPatternsPrompt = (logSummaries: string, filterContext: string) => `
You are the "HR Loop" system analyzing cross-swarm patterns. Context: ${filterContext}.
Your goal is to identify common success patterns, failure modes, and efficiency insights across multiple swarms.

Review the following execution logs:
${logSummaries}

Task:
1. Identify recurring patterns of success (what worked well across multiple instances?).
2. Identify common failure modes (what errors or bottlenecks appeared frequently?).
3. Suggest efficiency improvements based on successful strategies.

Return your response in this JSON format:
{
  "patterns": [
    {
      "type": "success" | "failure" | "efficiency",
      "description": "Description of the pattern.",
      "frequency": "high" | "medium" | "low",
      "confidence": number
    }
  ],
  "recommendation": "Overall recommendation for SOP improvement or creation.",
  "sop_candidate": boolean
}
`;

export const generateSOPPrompt = (patternAnalysis: string, title: string) => `
You are an expert technical writer for autonomous agents.
Based on the following pattern analysis, create a comprehensive Standard Operating Procedure (SOP) titled "${title}".

Pattern Analysis:
${patternAnalysis}

The SOP must include:
1. **Goal**: Clear objective of the procedure.
2. **Prerequisites**: What is needed before starting.
3. **Steps**: Detailed, numbered steps with specific instructions and tool usage.
4. **Error Handling**: How to handle common failures identified in the analysis.
5. **Verification**: How to verify success.

Format the output as a valid Markdown string.
`;
