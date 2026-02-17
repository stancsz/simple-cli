import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivityTypes } from 'botbuilder';
import request from 'supertest';
import { Engine } from '../../src/engine/orchestrator.js';

// Define hoisted mocks
const { mockProcess, mockSendActivity } = vi.hoisted(() => ({
  mockProcess: vi.fn(),
  mockSendActivity: vi.fn().mockResolvedValue({ id: 'msg-id' }),
}));

// Mock dependencies
vi.mock('botbuilder', async () => {
  const actual = await vi.importActual('botbuilder');
  return {
    ...actual,
    CloudAdapter: vi.fn().mockImplementation(() => ({
      process: mockProcess,
    })),
    ConfigurationBotFrameworkAuthentication: vi.fn(),
    ConfigurationServiceClientCredentialFactory: vi.fn(),
  };
});

// Mock external dependencies
vi.mock('../../src/llm.js', () => ({
  createLLM: vi.fn().mockImplementation(() => ({
    generate: vi.fn().mockImplementation(async (prompt, history, signal, onTyping) => {
        // Check history for trigger
        const crashTrigger = history.some((m: any) => m.content && m.content.includes('Crash me'));
        if (crashTrigger) {
             throw new Error('Simulated Crash');
        }

        // Trigger typing simulation
        if (onTyping) {
            onTyping();
        }
        return {
            thought: 'Thinking...',
            message: 'Hello from Bot',
            tool: 'none',
            args: {},
        };
    })
  })),
}));

vi.mock('../../src/mcp.js', () => {
  return {
    MCP: class MockMCP {
      init = vi.fn();
      getTools = vi.fn().mockResolvedValue([]);
      listServers = vi.fn().mockReturnValue([]);
      getClient = vi.fn().mockReturnValue(null);
    }
  };
});

vi.mock('../../src/skills.js', () => ({
  getActiveSkill: vi.fn().mockResolvedValue({
      systemPrompt: 'You are a helpful bot.',
  }),
}));

vi.mock('../../src/workflows/workflow_engine.js', () => ({
  WorkflowEngine: vi.fn(),
}));

vi.mock('../../src/workflows/execute_sop_tool.js', () => ({
  createExecuteSOPTool: vi.fn().mockReturnValue({ name: 'sop_tool' }),
}));

// Import the app (will use mocks)
import { app, adapter } from '../../src/interfaces/teams';

describe('Teams Adapter Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process a message activity, simulate typing, and respond', async () => {
    // Setup mock context
    const mockContext = {
      activity: {
        type: ActivityTypes.Message,
        text: 'Hello Bot',
        channelId: 'msteams',
      },
      sendActivity: mockSendActivity,
    };

    // Setup adapter.process to execute the logic
    mockProcess.mockImplementation(async (req, res, logic) => {
      await logic(mockContext);
      res.status(200).send();
    });

    // Send request
    await request(app)
      .post('/api/messages')
      .send({
        type: 'message',
        text: 'Hello Bot'
      })
      .expect(200);

    // Verify interactions
    expect(mockProcess).toHaveBeenCalled();

    // 1. Initial typing (from TeamsEngine logic)
    expect(mockSendActivity).toHaveBeenCalledWith({ type: ActivityTypes.Typing });

    // 2. LLM triggered typing (via onTyping -> s.start('Typing...'))
    const typingCalls = mockSendActivity.mock.calls.filter(call =>
        call[0] && typeof call[0] === 'object' && call[0].type === ActivityTypes.Typing
    );
    expect(typingCalls.length).toBeGreaterThanOrEqual(1);

    // 3. Final response
    expect(mockSendActivity).toHaveBeenCalledWith('Hello from Bot');
  });

  it('should handle errors gracefully', async () => {
    const mockContext = {
        activity: {
          type: ActivityTypes.Message,
          text: 'Crash me',
        },
        sendActivity: mockSendActivity,
    };

    mockProcess.mockImplementation(async (req, res, logic) => {
        try {
            await logic(mockContext);
        } catch (e) {
            // App should catch it inside logic
        }
        res.status(200).send();
    });

    await request(app)
      .post('/api/messages')
      .send({ type: 'message', text: 'Crash me' })
      .expect(200);

    expect(mockSendActivity).toHaveBeenCalledWith('Error: Simulated Crash');
  });
});
