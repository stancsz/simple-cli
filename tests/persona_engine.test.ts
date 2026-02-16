import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PersonaEngine } from '../src/persona/engine.js';
import { LLM, LLMResponse } from '../src/llm.js';
import * as loader from '../src/persona/loader.js';

vi.mock('../src/llm.js');
vi.mock('../src/persona/loader.js');

describe('PersonaEngine', () => {
  let engine: PersonaEngine;
  let mockLLM: LLM;

  const mockConfig = {
    name: 'TestBot',
    role: 'Tester',
    voice: { tone: 'neutral' },
    emoji_usage: false,
    catchphrases: {
      greeting: ['Hello!'],
      signoff: ['Bye!'],
      filler: []
    },
    working_hours: '09:00-17:00',
    response_latency: { min: 0, max: 0 },
    enabled: true
  };

  beforeEach(() => {
    // Only fake Date, keep real timers for setTimeout
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2023-01-01T12:00:00'));

    mockLLM = new LLM({ provider: 'mock', model: 'mock' });
    mockLLM.generate = vi.fn().mockResolvedValue({
      thought: 'Thinking',
      tool: 'none',
      args: {},
      message: 'This is a test response.',
      raw: 'This is a test response.'
    } as LLMResponse);

    // Mock loader to return config
    vi.mocked(loader.loadPersonaConfig).mockResolvedValue(mockConfig);

    engine = new PersonaEngine(mockLLM);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should load config on generate', async () => {
    await engine.generate('system', []);
    expect(loader.loadPersonaConfig).toHaveBeenCalled();
  });

  it('should inject personality into system prompt', async () => {
    await engine.generate('Original System', []);
    const callArgs = (mockLLM.generate as any).mock.calls[0];
    expect(callArgs[0]).toContain('You are TestBot, a Tester.');
  });

  it('should transform response (greeting/signoff)', async () => {
    const response = await engine.generate('system', []);
    expect(response.message).toContain('Hello!');
    expect(response.message).toContain('This is a test response.');
    expect(response.message).toContain('Bye!');
  });

  it('should simulate working hours (offline)', async () => {
    // Set time to 20:00 (8 PM) - Outside working hours
    vi.setSystemTime(new Date('2023-01-01T20:00:00'));

    const response = await engine.generate('system', []);
    expect(response.message).toContain('I am currently offline');
    expect(mockLLM.generate).not.toHaveBeenCalled(); // Should short-circuit
  });

  it('should call onTyping callback', async () => {
    const onTyping = vi.fn();
    // Force latency > 100ms
    vi.mocked(loader.loadPersonaConfig).mockResolvedValue({
        ...mockConfig,
        response_latency: { min: 150, max: 150 }
    });

    // Re-create engine to ensure new config is loaded (since cache is per instance)
    engine = new PersonaEngine(mockLLM);

    await engine.generate('system', [], undefined, onTyping);
    expect(onTyping).toHaveBeenCalled();
  });
});
