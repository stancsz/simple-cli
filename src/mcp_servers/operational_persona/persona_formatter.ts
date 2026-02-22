import { PersonaEngine } from '../../persona.js';
import { LLMResponse } from '../../llm.js';

export class PersonaFormatter {
  private engine: PersonaEngine;

  constructor(cwd: string = process.cwd()) {
    this.engine = new PersonaEngine(cwd);
  }

  async init() {
    await this.engine.loadConfig();
  }

  async format(text: string): Promise<string> {
    // Ensure config is loaded
    if (!this.engine.getConfig()) {
        await this.init();
    }

    const response: LLMResponse = {
      thought: 'Formatting operational update.',
      tool: 'none',
      args: {},
      message: text,
      raw: text
    };

    const formatted = await this.engine.transformResponse(response);
    return formatted.message || text;
  }
}
