import { PersonaConfig, PersonaEngine } from "../persona.js";
import { createLLM, LLM } from "../llm.js";

export class PersonaMiddleware {
  private personaEngine: PersonaEngine;
  private llm: LLM;
  private cache: Map<string, string> = new Map();

  constructor() {
    this.personaEngine = new PersonaEngine();
    // Use a lightweight model for tone transformation if possible, or default.
    // Ideally we want a fast model.
    this.llm = createLLM();
  }

  async initialize() {
    await this.personaEngine.loadConfig();
  }

  get config(): PersonaConfig | null {
      return this.personaEngine.getConfig();
  }

  /**
   * Transforms the response to match the persona.
   * @param text The raw text to transform.
   * @param onTyping Optional callback to trigger typing indicators.
   * @param context 'response' for final answers (full transformation), 'log' for updates (faster/lighter).
   */
  async transform(text: string, onTyping?: () => void, context: 'log' | 'response' = 'response'): Promise<string> {
    // Reload config if needed? simpler to assume initialize() was called or loadConfig is idempotent/fast check.
    await this.personaEngine.loadConfig();
    const config = this.config;

    if (!config || !config.enabled) return text;

    let transformedText = text;

    // 1. LLM Tone Rewrite (Only for final response to save time/cost)
    if (context === 'response') {
        const cacheKey = `${config.name}:${text}`;
        if (this.cache.has(cacheKey)) {
            transformedText = this.cache.get(cacheKey)!;
        } else {
            try {
                const systemPrompt = `You are ${config.name}, a ${config.role}. Your voice is ${config.voice.tone}.
Rewrite the following message to match your persona.
Do not change the meaning, technical details, or remove code blocks.
Keep it concise and professional but with your specific tone.`;

                // Use a separate/clean history for this transformation
                const response = await this.llm.generate(systemPrompt, [{ role: "user", content: text }]);

                if (response.message) {
                    transformedText = response.message;
                    // Cache the result
                    this.cache.set(cacheKey, transformedText);

                    // Simple cache eviction (optional, prevent memory leak)
                    if (this.cache.size > 100) {
                        const firstKey = this.cache.keys().next().value;
                        if (firstKey) this.cache.delete(firstKey);
                    }
                }
            } catch (e) {
                console.error("Persona LLM rewrite failed:", e);
                // Fallback to original text on failure
            }
        }
    } else {
        // For logs, maybe just prepend a small emoji or phrase based on role?
        // Reuse catchphrases logic in step 2.
    }

    // 2. Delegate to PersonaEngine for Catchphrases, Emojis, Latency, Working Hours
    // We construct a dummy LLMResponse to pass to PersonaEngine
    const dummyResponse = {
        thought: "",
        tool: "none",
        args: {},
        message: transformedText,
        raw: transformedText
    };

    // This handles:
    // - Working hours (returns "Offline" message if outside)
    // - Catchphrases (Greeting, Filler, Signoff)
    // - Emojis
    // - Latency (calls onTyping)
    const result = await this.personaEngine.transformResponse(dummyResponse, onTyping);

    return result.message || transformedText;
  }
}
