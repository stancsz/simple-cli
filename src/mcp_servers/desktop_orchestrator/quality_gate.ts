import { LLM } from "../../llm/index.js";
import { logMetric } from "../../logger.js";

const ASSESS_DESIGN_PROMPT = `You are a Senior Visual Design Critic and UI/UX Expert. Your role is to evaluate the aesthetic quality of user interface screenshots.

Your evaluation must be strict and professional, focusing on modern design standards. You should reject "basic", "MVP-styled", or "amateur" designs.

**Criteria for Evaluation:**
1.  **Typography:** Hierarchy, readability, font choice, spacing (line-height, letter-spacing).
2.  **Color Palette:** Harmony, contrast, accessibility, brand consistency, vibrancy (avoiding default browser blue/purple).
3.  **Layout & Spacing:** Whitespace usage, grid alignment, balance, responsiveness awareness.
4.  **Modern Aesthetic:** Does it look like a premium product from 2024+? (Glassmorphism, subtle shadows, rounded corners, smooth gradients - if appropriate).
5.  **Technical Polish:** No broken images, misaligned elements, or raw HTML artifacts.

**Output Format:**
You must respond with a JSON object containing:
- "score": A number between 0 and 100.
    - 0-50: Amateur / Broken / MVP (REJECT)
    - 51-69: Functional but ugly / Basic (REJECT)
    - 70-89: Good / Professional (PASS)
    - 90-100: Exceptional / Award-winning (PASS)
- "critique": A concise list of specific improvements needed (e.g., "Increase padding around the button," "Change font to Sans-Serif," "Fix contrast ratio").
- "reasoning": A brief explanation of the score.

**Example JSON:**
{
  "score": 65,
  "critique": [
    "Increase whitespace between sections.",
    "Use a more vibrant primary color; current blue feels default.",
    "Typography lacks hierarchy; headers are too small."
  ],
  "reasoning": "The layout is functional but feels cramped and generic. It lacks the polish expected of a modern application."
}
`;

export interface QualityAssessment {
    score: number;
    critique: string[];
    reasoning: string;
}

export class QualityGate {
    private llm: LLM;

    constructor() {
        // Use a vision-capable model chain.
        // We prioritize Claude 3.5 Sonnet for design tasks, then GPT-4o.
        this.llm = new LLM([
            { provider: "anthropic", model: "claude-3-5-sonnet-latest" },
            { provider: "openai", model: "gpt-4o" },
            { provider: "google", model: "gemini-1.5-pro" }
        ]);
    }

    async assess(screenshotBase64: string, context?: string, htmlContent?: string): Promise<QualityAssessment> {
        const systemPrompt = ASSESS_DESIGN_PROMPT;
        const userPrompt = `**Context:**
${context || "No specific context provided."}

**Instructions:**
Analyze the attached screenshot and provide a JSON response with 'score', 'critique', and 'reasoning'.`;

        const mimeType = "image/png"; // Assuming PNG for simplicity

        const history = [
            {
                role: "user",
                content: [
                    { type: "text", text: userPrompt },
                    { type: "image", image: screenshotBase64, mimeType },
                ],
            },
        ];

        try {
            const response = await this.llm.generate(systemPrompt, history as any);
            const text = response.thought || response.message || response.raw;

            let result: QualityAssessment;
            try {
                // Attempt to extract JSON block if wrapped in markdown code blocks
                const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                } else {
                    result = JSON.parse(text);
                }
            } catch (e) {
                console.error("Failed to parse QA response:", e);
                 // Fallback
                return {
                    score: 0,
                    critique: ["Failed to parse analysis result."],
                    reasoning: `LLM Output was not valid JSON: ${text}`
                };
            }

            // Heuristic technical check (similar to visual_quality_gate server)
            if (htmlContent) {
                 let techScore = 100;
                 const techCritique: string[] = [];

                 if (!htmlContent.includes('<meta name="viewport"')) {
                      techScore -= 15;
                      techCritique.push("Missing viewport meta tag.");
                 }
                 if (!htmlContent.includes('var(--')) {
                      techScore -= 10;
                      techCritique.push("No CSS variables detected.");
                 }

                 // Weighted average: 70% Visual, 30% Technical
                 const visualScore = result.score;
                 const finalScore = Math.round((visualScore * 0.7) + (techScore * 0.3));
                 result.score = finalScore;
                 result.critique = [...result.critique, ...techCritique];
                 if (techCritique.length > 0) {
                     result.reasoning += ` (Technical penalties: ${techCritique.join("; ")})`;
                 }
            }

            await logMetric('desktop_orchestrator', 'quality_assessment', 1, { score: result.score });
            return result;

        } catch (e) {
            console.error("Error in QualityGate.assess:", e);
            throw e;
        }
    }
}
