import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createLLM } from "../../../llm/index.js";

interface ComplexityEvaluation {
    score: number;
    recommended_model: string;
    reasoning: string;
}

const complexityHeuristic = (prompt: string): ComplexityEvaluation => {
    let score = 3;
    let recommended_model = "claude-3-haiku-20240307";

    if (prompt.length > 5000) score += 2;
    if (prompt.length > 20000) score += 2;

    const complexKeywords = ['architect', 'design', 'microservice', 'optimize', 'strategic', 'analyze'];
    const lowerPrompt = prompt.toLowerCase();

    let keywordMatches = 0;
    for (const keyword of complexKeywords) {
        if (lowerPrompt.includes(keyword)) {
            keywordMatches++;
        }
    }

    if (keywordMatches > 0) score += 1;
    if (keywordMatches > 2) score += 2;

    score = Math.min(10, Math.max(1, score));

    if (score >= 8) {
        recommended_model = "claude-3-opus-20240229";
    } else if (score >= 5) {
        recommended_model = "claude-3-5-sonnet-latest";
    }

    return {
        score,
        recommended_model,
        reasoning: `Heuristic evaluation based on prompt length (${prompt.length}) and keyword matches (${keywordMatches}).`
    };
};

export function registerAdaptiveRoutingTools(server: McpServer) {
    const handler = async ({ prompt }: { prompt: string }) => {
        try {
            // Use a fast model for evaluation, disable routing to prevent recursion
            const llm = createLLM("anthropic:claude-3-haiku-20240307");
            (llm as any).disableRouting = true;

            const systemPrompt = `You are a task complexity evaluator. Analyze the given prompt and rate its complexity on a scale of 1 to 10.
            1-4: Low complexity (e.g., formatting, simple parsing, short translations). Recommend 'claude-3-haiku-20240307' or 'gemini-2.0-flash-001'.
            5-7: Medium complexity (e.g., standard coding, drafting emails, summarizing). Recommend 'claude-3-5-sonnet-latest' or 'gpt-4o'.
            8-10: High complexity (e.g., complex architecture, deep reasoning, solving hard bugs). Recommend 'claude-3-opus-20240229' or 'deepseek-reasoner'.

            Respond ONLY with a JSON object in this format:
            {
                "score": number,
                "recommended_model": string,
                "reasoning": string
            }`;

            const response = await llm.generate(
                systemPrompt,
                [{ role: "user", content: prompt }]
            );

            let evaluation: ComplexityEvaluation;

            try {
                // Try parsing the direct text if it's clean JSON
                evaluation = JSON.parse(response.message || response.raw);
            } catch (e) {
                 // Try looking for json block
                 const match = (response.message || response.raw).match(/\{[\s\S]*\}/);
                 if (match) {
                     evaluation = JSON.parse(match[0]);
                 } else {
                     throw new Error("Failed to parse JSON from LLM response");
                 }
            }

            // Ensure valid score
            if (typeof evaluation.score !== 'number' || evaluation.score < 1 || evaluation.score > 10) {
                 throw new Error("Invalid score format");
            }

            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(evaluation, null, 2)
                }]
            };

        } catch (error) {
            console.warn(`[Adaptive Routing] LLM evaluation failed, falling back to heuristic:`, error);
            const fallback = complexityHeuristic(prompt);
            return {
                content: [{
                    type: "text" as const,
                    text: JSON.stringify(fallback, null, 2)
                }]
            };
        }
    };

    server.tool(
        "evaluate_task_complexity",
        "Evaluate the complexity of a prompt to recommend the optimal LLM model for routing.",
        {
            prompt: z.string().describe("The prompt or task description to evaluate.")
        },
        handler
    );

    // Alias for compatibility if needed
    server.tool(
        "score_task_complexity",
        "Alias for evaluate_task_complexity. Evaluate the complexity of a prompt.",
        {
             prompt: z.string().describe("The prompt or task description to evaluate.")
        },
        handler
    );
}
