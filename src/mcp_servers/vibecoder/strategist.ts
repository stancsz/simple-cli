import { createLLM, LLM } from "../../llm.js";
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

export class Strategist {
  private llm: LLM;

  constructor() {
    this.llm = createLLM("deepseek:deepseek-reasoner");
  }

  async askQuestions(context: string): Promise<string> {
    const systemPrompt = `You are The Strategist, the first pillar of the Vibecoder system.
Your goal is to extract high-density requirements from the user through Socratic questioning.
Based on the initial prompt, ask 3-5 crucial questions to clarify the "Must-Haves", "Should-Haves", and technical constraints.
Do not ask trivial questions. Focus on architectural decisions, tech stack, and user experience.`;

    const response = await this.llm.generate(systemPrompt, [{ role: "user", content: context }]);
    return response.message || response.raw || "";
  }

  async analyzeReference(path: string): Promise<string> {
    // Basic repo scanner
    const heuristics = this.scanRepo(path);
    return JSON.stringify(heuristics, null, 2);
  }

  private scanRepo(dir: string, depth = 0): any {
    if (depth > 2) return {}; // Limit depth
    const result: any = { files: [] };
    try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
            if (entry === "node_modules" || entry.startsWith(".")) continue;
            const fullPath = join(dir, entry);
            if (statSync(fullPath).isDirectory()) {
                result[entry] = this.scanRepo(fullPath, depth + 1);
            } else {
                result.files.push(entry);
                // Extract key config files for heuristics
                if (entry === "package.json" || entry === "README.md" || entry === "tsconfig.json" || entry.endsWith(".config.ts") || entry.endsWith(".config.js")) {
                    try {
                        result[entry] = readFileSync(fullPath, "utf-8").slice(0, 5000); // Limit size
                    } catch {}
                }
            }
        }
    } catch (e) {
        return { error: String(e) };
    }
    return result;
  }

  async generateSpecs(answers: string, refs: string): Promise<string> {
    const systemPrompt = `You are The Strategist. Your task is to finalize the Technical Specification (vibecoder/specs.md).
Analyze the user's answers and the reference project heuristics.
Construct a rigorous Spec following this structure:
1. System Architecture
2. Functional Requirements (Must-Haves, Should-Haves, Nice-to-Haves)
3. Technical Stack & Constraints
4. Data Models & Interfaces
5. API Specifications
6. Security & Performance

Ensure the spec is detailed, actionable, and strictly follows the "Code-First is Technical Debt" philosophy.
Use Markdown format.`;

    const content = `User Answers/Context:\n${answers}\n\nReference Heuristics:\n${refs}`;
    const response = await this.llm.generate(systemPrompt, [{ role: "user", content }]);
    return response.message || response.raw || "";
  }
}
