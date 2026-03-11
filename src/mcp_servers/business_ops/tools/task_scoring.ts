import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm.js";

// We use a lightweight model by default to score tasks
const SCORING_MODEL = process.env.SCORING_MODEL || "google:gemini-2.0-flash-001";

export function registerTaskScoringTools(server: McpServer) {
  server.tool(
    "score_task_complexity",
    "Analyzes a task prompt and returns a complexity score (0-1) and recommended model tier (low/medium/high).",
    {
      prompt: z.string().describe("The task prompt or user request to analyze."),
      system: z.string().optional().describe("The system prompt, if any."),
    },
    async ({ prompt, system }) => {
      try {
        const llm = createLLM(SCORING_MODEL);

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
  "tier": <"low" | "medium" | "high">,
  "reasoning": <string explaining your score>
}
`;

        const history = [{ role: "user", content: `System Context: ${system || 'None'}\n\nTask Prompt: ${prompt}` }];

        const response = await llm.generate(scoringPrompt, history);

        let score = 0.5;
        let tier = "medium";
        let reasoning = "Failed to parse LLM response.";

        if (response.raw) {
          try {
            // Attempt to extract JSON from the raw text response if the LLM didn't return a tool call
            const jsonPart = response.raw.match(/\{[\s\S]*\}/)?.[0] || response.raw;
            const parsed = JSON.parse(jsonPart);
            if (typeof parsed.score === 'number') score = parsed.score;
            if (['low', 'medium', 'high'].includes(parsed.tier)) tier = parsed.tier;
            if (parsed.reasoning) reasoning = parsed.reasoning;
          } catch (e) {
             console.warn(`[score_task_complexity] Failed to parse scoring response: ${e}`);
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ score, tier, reasoning }, null, 2)
            }
          ]
        };
      } catch (error: any) {
        console.error(`[score_task_complexity] Scoring failed: ${error.message}`);
        // Fallback to medium tier on error
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ score: 0.5, tier: "medium", reasoning: "Fallback due to scoring error." }, null, 2)
            }
          ]
        };
      }
    }
  );
}
