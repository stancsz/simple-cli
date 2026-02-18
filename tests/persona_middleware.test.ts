import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonaMiddleware } from '../src/persona/middleware.js';

// Mock dependencies
vi.mock('../src/llm.js', () => ({
  createLLM: () => ({
    generate: vi.fn().mockResolvedValue({ message: "Tone rewritten." }),
  }),
}));

vi.mock('../src/persona.js', () => ({
  PersonaEngine: class {
    async loadConfig() {}
    getConfig() {
      return {
        name: "TestBot",
        role: "Tester",
        voice: { tone: "Happy" },
        enabled: true,
        emoji_usage: true,
        catchphrases: { greeting: ["Hi"], signoff: ["Bye"] },
      };
    }
    async transformResponse(res: any, onTyping?: any) {
      if (onTyping) onTyping();
      return { ...res, message: res.message + " 😊" };
    }
  },
  PersonaConfigSchema: {},
}));

describe('PersonaMiddleware', () => {
  let middleware: PersonaMiddleware;

  beforeEach(() => {
    middleware = new PersonaMiddleware();
  });

  it('should rewrite tone for response context', async () => {
    const result = await middleware.transform("Hello", undefined, 'response');
    expect(result).toBe("Tone rewritten. 😊");
  });

  it('should skipping tone rewrite for log context', async () => {
    // For log, it skips LLM, so uses original text + transformation
    const result = await middleware.transform("Hello", undefined, 'log');
    expect(result).toBe("Hello 😊");
  });
});
