import { join } from "path";
import { LLM, LLMResponse } from "../llm.js";
import { PersonaConfig, loadPersonaConfig } from "./loader.js";
import { injectPersonality as injectSystem, transformResponse as transformResp, isWithinWorkingHours } from "./injector.js";

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

  constructor(private llm: LLM, cwd: string = process.cwd()) {
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

  async generate(
    system: string,
    history: any[],
    signal?: AbortSignal,
    onTyping?: () => void
  ): Promise<LLMResponse> {
    if (!this.config) {
      await this.loadConfig();
    }

    // Optimization: Check working hours before calling LLM
    if (this.config?.enabled && this.config.working_hours && !isWithinWorkingHours(this.config.working_hours)) {
        // Just call transform to return the offline message
        // Create a dummy response to transform
        const dummy: LLMResponse = {
            thought: "",
            tool: "none",
            args: {},
            message: "",
            raw: ""
        };
        return transformResp(dummy, this.config, onTyping);
    }

    const systemWithPersona = injectSystem(system, this.config!);
    const response = await this.llm.generate(systemWithPersona, history, signal);
    return transformResp(response, this.config!, onTyping);
  }
}
