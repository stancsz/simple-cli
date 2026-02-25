export const analyzeCodeSmellPrompt = (filePath: string, content: string) => `
You are an expert software architect and code quality analyst.
Analyze the following file (${filePath}) for:
1. Performance bottlenecks
2. Bugs or potential runtime errors
3. Architectural debt or anti-patterns
4. Readability and maintainability improvements

File Content:
\`\`\`typescript
${content}
\`\`\`

Return a JSON object with the following structure:
{
  "issues": [
    {
      "type": "performance" | "bug" | "debt" | "maintainability",
      "severity": "high" | "medium" | "low",
      "description": "...",
      "location": "line numbers or function names"
    }
  ],
  "summary": "High-level summary of the analysis",
  "recommended_action": "refactor" | "rewrite" | "minor_fix" | "none"
}
`;

export const proposalPrompt = (filePath: string, content: string, description: string) => `
You are a senior software engineer tasked with improving the codebase.
Proposed Improvement: ${description}

File: ${filePath}
Current Content:
\`\`\`typescript
${content}
\`\`\`

Generate the FULL REVISED CONTENT of the file to implement the improvement.
Ensure the code is correct, follows project style, and directly addresses the issue.

Return a JSON object with:
{
  "rationale": "Why this change is necessary and how it works",
  "test_plan": "How to verify this change (e.g., specific test cases to add or run)",
  "revised_content": "The full new content of the file"
}
`;

export const supervisorPrompt = (filePath: string, diff: string, summary: string) => `
You are a STRICT Code Supervisor and Security Auditor.
Your job is to REJECT any change that is:
1. Unsafe or introduces security vulnerabilities.
2. Incorrect or introduces bugs.
3. Violates project architectural principles.
4. Unnecessary or frivolous.

Proposed Change to: ${filePath}
Summary: ${summary}
Diff:
\`\`\`diff
${diff}
\`\`\`

Analyze the diff carefully.
Return a JSON object:
{
  "approved": boolean,
  "reason": "Detailed explanation of why it was approved or rejected",
  "risk_level": "high" | "medium" | "low"
}
`;
