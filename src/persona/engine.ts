import { join } from "path";
import { LLMResponse } from "../llm.js";
import { PersonaConfig, loadPersonaConfig } from "./loader.js";
import { injectPersonality as injectSystem, transformResponse as transformResp } from "./injector.js";

const DEFAULT_PERSONA: PersonaConfig = {
  name: "Jules",
  role: "Senior Software Engineer",
  voice: {
    tone: "professional, helpful, concise"
  },
  emoji_usage: true,
  catchphrases: {
    greeting: ["Hello!", "Hi there!", "Greetings!"],
    signoff: ["Let me know if you need anything else.", "Happy coding!", "Cheers!"],
    filler: ["I see.", "Interesting.", "Got it."]
  },
  working_hours: "09:00-17:00",
  response_latency: {
    min: 100,
    max: 500
  },
  enabled: true
};

export class PersonaEngine {
  private config: PersonaConfig | null = null;
  private configPath!: string;
  private company: string | null = null;
  private cwd: string;

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    const company = process.env.JULES_COMPANY;
    this.company = company || null;
    this.updateConfigPath();
  }

  setCompany(company: string) {
    this.company = company;
    this.updateConfigPath();
    this.config = null; // Force reload
  }

  private updateConfigPath() {
    if (this.company) {
      this.configPath = join(this.cwd, ".agent", "companies", this.company, "persona.json");
    } else {
      this.configPath = join(this.cwd, ".agent", "persona.json");
    }
  }

  async loadConfig(): Promise<void> {
    const loaded = await loadPersonaConfig(this.configPath);
    if (loaded) {
      this.config = loaded;
    } else {
      // Fallback to default persona if none configured
      this.config = DEFAULT_PERSONA;
    }
  }

  async injectPersonality(systemPrompt: string): Promise<string> {
    if (!this.config) {
      await this.loadConfig();
    }
    return injectSystem(systemPrompt, this.config!);
  }

  async transform(response: LLMResponse): Promise<LLMResponse> {
    if (!this.config) {
      await this.loadConfig();
    }
    return transformResp(response, this.config!);
  }
}
