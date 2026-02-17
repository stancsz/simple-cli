import { describe, it, expect, vi, beforeEach } from 'vitest';
import { App } from '@slack/bolt';
import { MCP } from '../../src/mcp.js';
import { Engine } from '../../src/engine/orchestrator.js';

// Mocks
vi.mock('@slack/bolt', () => {
  const mockApp = {
    start: vi.fn(),
    action: vi.fn(),
    event: vi.fn(),
    client: {
      chat: {
        postMessage: vi.fn().mockResolvedValue({ ok: true }),
      },
      reactions: {
        add: vi.fn().mockResolvedValue({ ok: true }),
      },
      conversations: {
        replies: vi.fn().mockResolvedValue({ messages: [] }),
      },
      auth: {
        test: vi.fn().mockResolvedValue({ user_id: 'U_BOT' }),
      }
    },
  };
  return {
    App: vi.fn(() => mockApp),
  };
});

vi.mock('../../src/mcp.js', () => {
  const mockClient = {
    callTool: vi.fn().mockResolvedValue({ content: [] }),
  };
  const mockMCP = {
    init: vi.fn(),
    startServer: vi.fn(),
    isServerRunning: vi.fn().mockReturnValue(false),
    getTools: vi.fn().mockResolvedValue([]),
    getClient: vi.fn().mockReturnValue(mockClient),
  };
  return {
    MCP: vi.fn(() => mockMCP),
  };
});

vi.mock('../../src/llm.js', () => {
  return {
    createLLM: vi.fn(() => ({})),
    LLM: vi.fn(),
  };
});

vi.mock('../../src/engine/orchestrator.js', () => {
  const MockEngine = vi.fn(function(this: any) {
      this.s = { start: vi.fn(), stop: vi.fn() };
      this.log = vi.fn();
      this.run = vi.fn((ctx: any) => {
        // Simulate a successful execution by pushing a response to history
        ctx.history.push({ role: 'assistant', content: JSON.stringify({ message: "Task completed successfully." }) });
        return Promise.resolve();
      });
      this.getUserInput = vi.fn();
  });
  return {
    Engine: MockEngine,
    Context: vi.fn(() => ({
      history: [],
    })),
    Registry: vi.fn(() => ({
      tools: new Map(),
    })),
    Message: {},
  };
});

vi.mock('../../src/persona.js', () => {
  return {
    PersonaEngine: vi.fn(() => ({
        loadConfig: vi.fn(),
        injectPersonality: vi.fn((s) => s),
        transformResponse: vi.fn((r) => r),
        simulateTyping: vi.fn(),
    })),
  };
});

vi.mock('../../src/skills.js', () => ({
  getActiveSkill: vi.fn().mockResolvedValue({ systemPrompt: 'Test Prompt' }),
}));

vi.mock('../../src/workflows/workflow_engine.js', () => ({
  WorkflowEngine: vi.fn(),
}));

vi.mock('../../src/workflows/execute_sop_tool.js', () => ({
  createExecuteSOPTool: vi.fn().mockReturnValue({ name: 'execute_sop' }),
}));

describe('Slack Interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should handle app_mention event correctly', async () => {
    // Import the module
    await import('../../src/interfaces/slack.js');

    // Get the App instance
    const appInstance = (App as any).mock.results[0].value;
    const mentionHandler = appInstance.event.mock.calls.find((call: any) => call[0] === 'app_mention')[1];
    expect(mentionHandler).toBeDefined();

    // Setup Event Data
    const mockSay = vi.fn();
    const mockClient = appInstance.client;
    const mockEvent = {
        channel: 'C123',
        text: '<@U_BOT> Help me with code',
        ts: '1000.002',
        thread_ts: '1000.000',
    };

    // Setup MCP Mock behavior for this test
    const mcpInstance = (MCP as any).mock.results[0].value;
    const brainClient = mcpInstance.getClient(); // Returns the mockClient
    brainClient.callTool.mockResolvedValueOnce({
        content: [{ text: "Memory: User uses TypeScript." }]
    });

    // Setup Conversations Replies (Thread History)
    mockClient.conversations.replies.mockResolvedValue({
        messages: [
            { ts: '1000.000', user: 'U_USER', text: 'Initial request' },
            { ts: '1000.001', user: 'U_BOT', text: 'Sure.' },
            { ts: '1000.002', user: 'U_USER', text: 'Help me with code' } // Current
        ]
    });

    // Run Handler
    await mentionHandler({ event: mockEvent, say: mockSay, client: mockClient });

    // Assertions

    // 1. Brain Server Started
    expect(mcpInstance.startServer).toHaveBeenCalledWith('brain');

    // 2. Thread History Fetched
    expect(mockClient.conversations.replies).toHaveBeenCalledWith({
        channel: 'C123',
        ts: '1000.000',
        limit: 10
    });

    // 3. Brain Recalled
    expect(brainClient.callTool).toHaveBeenCalledWith({
        name: 'recall',
        arguments: { query: 'Help me with code', limit: 1 }
    });

    // 4. Engine.run called with enriched text
    // We need to spy on the run method of the SlackEngine instance.
    // Since we can't easily access the instance, we verify via the prototype mock of Engine.
    // Or we can check all instances of Engine.
    // The SlackEngine extends MockEngine.
    // We can spy on MockEngine.prototype.run? No, run is an instance method in my mock class.
    // But `vi.mock` factory creates the class.

    // Let's assume Engine was instantiated.
    const engineInstances = (Engine as any).mock.instances;
    const lastEngine = engineInstances[engineInstances.length - 1];
    expect(lastEngine.run).toHaveBeenCalled();

    const runArgs = lastEngine.run.mock.calls[0];
    const context = runArgs[0];
    const textArg = runArgs[1];

    expect(textArg).toContain('[Past Memory]');
    expect(textArg).toContain('User uses TypeScript');
    expect(textArg).toContain('Help me with code');

    // 5. Context History Populated
    // Expect 3 messages (Initial request, Sure., Response from Engine)
    expect(context.history).toHaveLength(3);
    expect(context.history[0].content).toBe('Initial request');
    expect(context.history[1].content).toBe('Sure.');
    expect(context.history[2].role).toBe('assistant');

    // 6. Response Sent
    // Check for "Thinking..."
    expect(mockClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        text: "Thinking..."
    }));

    // Check for Final Response with typing: true
    expect(mockClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
        text: "Task completed successfully.",
        typing: true
    }));
  });
});
