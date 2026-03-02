import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { resolve } from "path";
import { LLM } from "../../llm.js";
import { loadCompanyProfile } from "../../context/company-profile.js";
import { ASSESS_DESIGN_PROMPT } from "./prompts.js";

const server = new McpServer({
  name: "visual_quality_gate",
  version: "1.0.0",
});

server.tool(
  "assess_design_quality",
  "Evaluate the visual quality of a UI design from a screenshot.",
  {
    screenshot_path: z.string().describe("Path to the screenshot file (PNG/JPG)."),
    company_id: z.string().optional().describe("Company ID to load brand guidelines."),
    context: z.string().optional().describe("Additional context about the design (e.g. 'landing page')."),
    html_content: z.string().optional().describe("HTML content for technical analysis."),
  },
  async ({ screenshot_path, company_id, context, html_content }) => {
    try {
      const fullPath = resolve(process.cwd(), screenshot_path);
      if (!existsSync(fullPath)) {
        return {
          content: [{ type: "text", text: `Error: Screenshot not found at ${fullPath}` }],
          isError: true,
        };
      }

      const imageBuffer = await readFile(fullPath);
      const base64Image = imageBuffer.toString("base64");

      const mimeType = fullPath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

      let brandContext = "";
      if (company_id) {
        const profile = await loadCompanyProfile(company_id);
        if (profile) {
          if (profile.brandVoice) {
            brandContext += `\nBrand Voice: ${profile.brandVoice}`;
          }
        }
      }

      // 1. Technical Analysis (Heuristic)
      let techScore = 100;
      const techCritique: string[] = [];

      if (html_content) {
          if (!html_content.includes('<meta name="viewport"')) {
              techScore -= 15;
              techCritique.push("Missing viewport meta tag (critical for responsiveness).");
          }
          if (!html_content.includes('var(--')) {
              techScore -= 10;
              techCritique.push("No CSS variables detected; consider using them for theming.");
          }
          if (!html_content.includes('<main') && !html_content.includes('<header') && !html_content.includes('<footer')) {
              techScore -= 10;
              techCritique.push("Poor semantic HTML; missing <main>, <header>, or <footer> tags.");
          }
      }

      // 2. Visual Analysis (LLM)
      const systemPrompt = ASSESS_DESIGN_PROMPT;
      const userPrompt = `**Context:**
${context || "No specific context provided."}
${brandContext}

**Instructions:**
Analyze the attached screenshot and provide a JSON response with 'score', 'critique', and 'reasoning'.`;

      // Use a vision-capable model chain.
      // We prioritize Claude 3.5 Sonnet for design tasks, then GPT-4o.
      const llm = new LLM([
          { provider: "anthropic", model: "claude-3-5-sonnet-latest" },
          { provider: "openai", model: "gpt-4o" },
          { provider: "google", model: "gemini-1.5-pro" }
      ]);

      // Construct the message for Vercel AI SDK
      // Note: LLM.generate takes history[]
      const history = [
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image", image: base64Image, mimeType },
          ],
        },
      ];

      const response = await llm.generate(systemPrompt, history as any);

      let result;
      try {
        const text = response.thought || response.message || response.raw;
        // Attempt to extract JSON block if wrapped in markdown code blocks
        const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            result = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        } else {
             result = JSON.parse(text);
        }

        // Merge Technical Analysis
        if (html_content) {
            // Weighted average: 70% Visual, 30% Technical (if HTML provided)
            const visualScore = result.score;
            const finalScore = Math.round((visualScore * 0.7) + (techScore * 0.3));

            result.score = finalScore;
            result.critique = [...result.critique, ...techCritique];

            if (techCritique.length > 0) {
                result.reasoning += ` (Technical penalties applied: ${techCritique.join("; ")})`;
            }
        }

      } catch (e) {
          console.error("Failed to parse QA response:", e);
          return {
              content: [{ type: "text", text: `Error parsing QA response: ${response.raw}` }],
              isError: true
          }
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };

    } catch (e) {
      console.error("Error in assess_design_quality:", e);
      return {
        content: [{ type: "text", text: `Error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Visual Quality Gate MCP Server running on stdio");
}

import { fileURLToPath } from 'url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
      console.error("Server error:", error);
      process.exit(1);
    });
}
