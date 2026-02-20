import { createLLM, LLM } from "../../llm.js";

export class Builder {
  private llm: LLM;

  constructor() {
    this.llm = createLLM("deepseek:deepseek-chat");
  }

  async implementFile(blueprint: string, filePath: string, specs: string): Promise<string> {
    const systemPrompt = `You are The Builder, the third pillar of the Vibecoder system.
Your task is to implement the file "${filePath}" based strictly on the Blueprint (blueprint.md) and Specs (specs.md).
You execute the Architect's vision.

Rules:
1. Follow the interface contracts defined in the Blueprint.
2. Ensure the code is production-ready, typed (TypeScript), and commented.
3. Adhere to the "Must-Haves" in the Specs.
4. Return ONLY the code for the file, inside a code block. Do not add conversational text.`;

    const content = `Specs:\n${specs}\n\nBlueprint:\n${blueprint}\n\nTask: Implement ${filePath}`;
    const response = await this.llm.generate(systemPrompt, [{ role: "user", content }]);

    // Extract code block if present
    const codeBlock = response.message.match(/```(?:typescript|ts|js|javascript|json|tsx|jsx)?\n([\s\S]*?)```/);
    if (codeBlock) {
        return codeBlock[1];
    }
    return response.message;
  }
}
