import { createLLM, LLM } from "../../llm/index.js";

export class Architect {
  private llm: LLM;

  constructor() {
    this.llm = createLLM("deepseek:deepseek-reasoner");
  }

  async generateBlueprint(specs: string): Promise<string> {
    const systemPrompt = `You are The Architect, the second pillar of the Vibecoder system.
Your mission is to convert the Strategist's Specs (specs.md) into a concrete Technical Blueprint (blueprint.md).
Do not write implementation code yet. Focus on the "Map" and structure.

Deliverables:
1. Complete File Tree (folder structure)
2. Interface Contracts (TypeScript interfaces/types for key components)
3. API Schemas (if applicable)
4. Component Hierarchy
5. Data Flow Descriptions

The Blueprint must be verified against the Specs. Any deviation must be justified.
Format as Markdown.`;

    const response = await this.llm.generate(systemPrompt, [{ role: "user", content: `Here are the Specs:\n${specs}` }]);
    return response.message || response.raw || "";
  }
}
