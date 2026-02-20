import { PersonaEngine } from './persona.js';

export function createLLM() {
  const engine = new PersonaEngine();
  // We need to call loadConfig() but it's async.
  // Since createLLM is sync (usually), we might fire and forget or hope it's fast.
  // Actually src/llm.ts probably calls it?
  // Let's check src/llm.ts usage.
  // But for now, we just want to verify it loads.
  engine.loadConfig().then(() => {
      const config = engine.getConfig();
      if (config) {
          console.log(`[MockLLM] Persona Config Loaded: ${config.name}`);
      } else {
          console.log(`[MockLLM] Persona Config NOT Loaded`);
      }
  }).catch(err => {
      console.error(`[MockLLM] Error loading persona: ${err}`);
  });

  return {
    embed: async (text) => new Array(1536).fill(0),
    generate: async () => ({ thought: "mock", tool: "none", args: {}, message: "mock response" })
  };
}

export class LLM {
  constructor() {
      this.engine = new PersonaEngine();
      this.engine.loadConfig().then(() => {
          const config = this.engine.getConfig();
          if (config) {
              console.log(`[MockLLM] Persona Config Loaded: ${config.name}`);
          }
      });
  }
  async embed(text) { return new Array(1536).fill(0); }
  async generate() { return { thought: "mock", tool: "none", args: {}, message: "mock response" }; }
}
