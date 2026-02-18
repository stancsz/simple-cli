import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PersonaMiddleware } from '../src/persona/middleware.js';

// Mock fs to provide a valid config
vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(JSON.stringify({
    name: "TestBot",
    role: "Tester",
    voice: { tone: "Happy" },
    enabled: true,
    emoji_usage: true,
    catchphrases: {
      greeting: ["Hello"],
      signoff: ["Bye"],
      filler: []
    },
    working_hours: "00:00-23:59", // All day
    response_latency: { min: 0, max: 0 }
  }))
}));

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true)
}));

// Mock LLM to return simple echo
vi.mock('../src/llm.js', () => ({
  createLLM: () => ({
    generate: vi.fn().mockResolvedValue({ message: "Rewritten: Original" })
  })
}));

describe('Persona Integration', () => {
  let middleware: PersonaMiddleware;

  beforeEach(() => {
    middleware = new PersonaMiddleware();
  });

  it('should apply catchphrases and emojis via real PersonaEngine', async () => {
    // This will use the REAL PersonaEngine implementation from src/persona.ts
    // but with mocked FS config loading.

    const result = await middleware.transform("Original", undefined, 'response');

    // Check for catchphrases injected by real transformResponse
    expect(result).toContain("Hello");
    expect(result).toContain("Rewritten: Original");
    expect(result).toContain("Bye");

    // Check for emoji
    // DEFAULT_EMOJIS = ["😊", "👍", "🚀", "🤖", "💻", "✨", "💡", "🔥"]
    const hasEmoji = ["😊", "👍", "🚀", "🤖", "💻", "✨", "💡", "🔥"].some(e => result.includes(e));
    expect(hasEmoji).toBe(true);
  });
});
