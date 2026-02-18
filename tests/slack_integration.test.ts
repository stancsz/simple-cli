import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SlackInterface } from '../src/interfaces/slack.js';

// Mock dependencies
vi.mock('@slack/bolt', () => ({
  App: class {
    client = {
        chat: { postMessage: vi.fn() },
        reactions: { add: vi.fn() }
    };
    event = vi.fn();
    action = vi.fn();
    start = vi.fn();
  }
}));

// Mock PersonaMiddleware used by BaseInterface
vi.mock('../src/persona/middleware.js', () => ({
  PersonaMiddleware: class {
    initialize = vi.fn();
    transform = vi.fn().mockImplementation((text) => Promise.resolve(`Transformed: ${text}`));
  }
}));

// Mock Engine to avoid loading heavy stuff
vi.mock('../src/engine/orchestrator.js', () => ({
    Engine: class {},
    Context: class {},
    Registry: class { tools = new Map() }
}));

vi.mock('../src/mcp.js', () => ({
    MCP: class { init = vi.fn(); getTools = vi.fn().mockResolvedValue([]) }
}));

vi.mock('../src/llm.js', () => ({
    createLLM: vi.fn()
}));

vi.mock('../src/skills.js', () => ({
    getActiveSkill: vi.fn()
}));

vi.mock('../src/workflows/workflow_engine.js', () => ({
    WorkflowEngine: class {}
}));
vi.mock('../src/workflows/execute_sop_tool.js', () => ({
    createExecuteSOPTool: vi.fn().mockReturnValue({ name: 'sop' })
}));

describe('SlackInterface', () => {
  it('should initialize app and listen to events', () => {
    const slack = new SlackInterface();
    expect(slack.app.event).toHaveBeenCalledWith("app_mention", expect.any(Function));
  });

  it('sendResponse should call middleware and sendRaw', async () => {
    const slack = new SlackInterface();
    const mockClient = { chat: { postMessage: vi.fn() } };

    await slack.sendResponse("Hello", 'response', { client: mockClient, channel: 'C1', thread_ts: 'T1' });

    expect(mockClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: "Transformed: Hello",
      channel: 'C1'
    }));
  });
});
