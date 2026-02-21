import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlackEngine } from '../../src/interfaces/slack.js';
import { createLLM } from '../../src/llm.js';
import { Registry, Context } from '../../src/engine/orchestrator.js';
import { MCP } from '../../src/mcp.js';
import { join } from 'path';
import { writeFile, mkdir, rm } from 'fs/promises';
import { tmpdir } from 'os';

// Mock Slack Bolt
vi.mock('@slack/bolt', () => {
  return {
    App: class {
      constructor() {}
      action() {}
      event() {}
      start() {}
    }
  };
});

// Mock 'ai' module
vi.mock('ai', () => ({
  generateText: vi.fn().mockImplementation(async ({ system }) => {
    // Check if persona is injected in system prompt
    if (system.includes("You are Sarah_DevOps")) {
        return {
            text: JSON.stringify({ message: "Hello World", thought: "Thinking about emojis" }),
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        };
    }
    return {
        text: JSON.stringify({ message: "System prompt missing persona", thought: "Error" }),
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    };
  }),
  embed: vi.fn().mockResolvedValue({ embedding: [] }),
  createOpenAI: vi.fn().mockReturnValue(() => ({})),
  createAnthropic: vi.fn().mockReturnValue(() => ({})),
  createGoogleGenerativeAI: vi.fn().mockReturnValue(() => ({})),
}));

// Mock 'fs/promises' is not needed as we use real fs with temp dir

describe('Persona Integration Test', () => {
  const testRoot = join(tmpdir(), `agent-test-persona-${Date.now()}`);
  const personaConfig = {
    name: "Sarah_DevOps",
    role: "DevOps Engineer",
    voice: { tone: "Professional but friendly" },
    emoji_usage: true,
    catchphrases: {
      greeting: ["Hey team!"],
      signoff: ["Cheers!"],
      filler: []
    },
    working_hours: "00:00-23:59", // Always working
    response_latency: { min: 100, max: 2000 }, // Enable latency simulation
    enabled: true
  };

  beforeEach(async () => {
    await mkdir(join(testRoot, '.agent', 'config'), { recursive: true });
    await writeFile(
      join(testRoot, '.agent', 'config', 'persona.json'),
      JSON.stringify(personaConfig)
    );
    // Spy on cwd
    vi.spyOn(process, 'cwd').mockReturnValue(testRoot);
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(testRoot, { recursive: true, force: true });
  });

  it('should inject personality, transform response, and trigger typing indicators', async () => {
    // 1. Setup Slack Client Mock
    const mockSlackClient = {
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ok: true }),
      }
    };

    // 2. Setup Engine dependencies
    // Use OpenAI explicitly to match the stubbed API key
    const llm = createLLM("openai:gpt-4o");

    const registry = new Registry();
    const mcp = new MCP();
    // Mock MCP methods to avoid starting real servers
    vi.spyOn(mcp, 'init').mockResolvedValue(undefined);
    vi.spyOn(mcp, 'listServers').mockReturnValue([]);
    vi.spyOn(mcp, 'getTools').mockResolvedValue([]);
    vi.spyOn(mcp, 'startServer').mockResolvedValue(undefined);

    // 3. Create SlackEngine
    const engine = new SlackEngine(
      llm,
      registry,
      mcp,
      mockSlackClient,
      'C12345',
      'ts-123'
    );

    // 4. Create Context
    const context = new Context(testRoot, {
        name: 'test-skill',
        description: 'test',
        tools: [],
        systemPrompt: 'You are a helpful assistant.'
    } as any);

    // 5. Run Engine
    await engine.run(context, "Hello", { interactive: false });

    // 6. Verify Slack Output
    const calls = mockSlackClient.chat.postMessage.mock.calls;

    // Check for typing indicators
    const typingCall = calls.find((c: any) => c[0].text && c[0].text.includes("[Start] Typing..."));
    expect(typingCall).toBeDefined();

    // Check for transformed response in context history (since final message sending is in adapter logic, not Engine class)
    const assistantMsg = context.history.filter(m => m.role === 'assistant').pop();
    expect(assistantMsg).toBeDefined();
    if (assistantMsg) {
        const text = assistantMsg.content;
        expect(text).toContain("Hey team!");
        expect(text).toContain("Cheers!");
        const DEFAULT_EMOJIS = ["😊", "👍", "🚀", "🤖", "💻", "✨", "💡", "🔥"];
        const hasEmoji = DEFAULT_EMOJIS.some(e => text.includes(e));
        expect(hasEmoji).toBe(true);
    }
  });
});
