import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Modules with Side Effects BEFORE imports
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

vi.mock('botbuilder', () => {
    return {
        CloudAdapter: class {
            onTurnError: any;
            process: any;
        },
        ConfigurationServiceClientCredentialFactory: class {},
        createBotFrameworkAuthenticationFromConfiguration: vi.fn(),
        ActivityHandler: class {
            onMessage() {}
            onMembersAdded() {}
            run() {}
        },
        TurnContext: {
            removeRecipientMention: vi.fn()
        },
        MessageFactory: {
            text: vi.fn()
        },
        ActivityTypes: {
            Typing: 'typing',
            MessageReaction: 'messageReaction'
        }
    }
});

vi.mock('discord.js', () => {
    return {
        Client: class {
            once() {}
            on() {}
            login() {}
        },
        GatewayIntentBits: {},
        Partials: {},
        Events: {
            ClientReady: 'ready',
            MessageCreate: 'messageCreate'
        },
        TextChannel: class {}
    }
});

// Import after mocks
import { SlackEngine } from '../../src/interfaces/slack.js';
import { TeamsEngine } from '../../src/interfaces/teams.js';
import { DiscordEngine } from '../../src/interfaces/discord.js';
import { Context, Registry } from '../../src/engine/orchestrator.js';
import { MCP } from '../../src/mcp.js';
import { ActivityTypes } from 'botbuilder';

// Mock Dependencies
const mockPersonaEngine = {
  loadConfig: vi.fn(),
  isWithinWorkingHours: vi.fn(),
  getConfig: vi.fn().mockReturnValue({ working_hours: "09:00-17:00" }),
  formatMessage: vi.fn().mockImplementation((msg) => `[Formatted] ${msg}`),
};

const mockLLM = {
  personaEngine: mockPersonaEngine,
  generate: vi.fn().mockResolvedValue({ message: "LLM Response", thought: "Thinking", tool: "none" }),
};

// Mock MCP to avoid side effects
const mockMCP = {
    init: vi.fn(),
    getTools: vi.fn().mockResolvedValue([]),
    listServers: vi.fn().mockReturnValue([]),
    isServerRunning: vi.fn().mockReturnValue(false),
    startServer: vi.fn().mockResolvedValue(undefined),
    getClient: vi.fn().mockReturnValue(undefined)
} as unknown as MCP;

const mockRegistry = new Registry();

// Context
const mockContext = new Context(process.cwd(), {
    name: 'test',
    description: 'test',
    tools: [],
    systemPrompt: 'sys'
} as any);

describe('Persona Interface Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SlackEngine', () => {
    it('should send offline message and skip execution if outside working hours', async () => {
      // Setup
      mockPersonaEngine.isWithinWorkingHours.mockReturnValue(false);
      const mockClient = { chat: { postMessage: vi.fn().mockResolvedValue({}) } };

      const engine = new SlackEngine(mockLLM, mockRegistry, mockMCP, mockClient, 'C1', 'ts1');

      // Execute
      await engine.run(mockContext, "Hi");

      // Verify
      expect(mockPersonaEngine.loadConfig).toHaveBeenCalled();
      expect(mockPersonaEngine.isWithinWorkingHours).toHaveBeenCalled();
      expect(mockClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({
          text: expect.stringContaining("[Formatted] I am currently offline")
      }));
      expect(mockLLM.generate).not.toHaveBeenCalled(); // Engine.run skipped
    });

    it('should run normally and support typing if inside working hours', async () => {
        // Setup
        mockPersonaEngine.isWithinWorkingHours.mockReturnValue(true);
        const mockClient = { chat: { postMessage: vi.fn().mockResolvedValue({}) } };

        const engine = new SlackEngine(mockLLM, mockRegistry, mockMCP, mockClient, 'C1', 'ts1');

        // Execute
        await engine.run(mockContext, "Hi");

        // Verify Execution
        expect(mockLLM.generate).toHaveBeenCalled();

        // Verify Typing
        // Slack Web API doesn't support typing indicators easily, so we ensure no spam messages are sent
        engine['s'].start("Typing...");
        expect(mockClient.chat.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({
            type: "typing"
        }));
      });
  });

  describe('TeamsEngine', () => {
    it('should send offline message and skip execution if outside working hours', async () => {
      mockPersonaEngine.isWithinWorkingHours.mockReturnValue(false);
      const mockTurnContext = { sendActivity: vi.fn().mockResolvedValue({}) };

      const engine = new TeamsEngine(mockLLM, mockRegistry, mockMCP, mockTurnContext as any);

      await engine.run(mockContext, "Hi");

      expect(mockTurnContext.sendActivity).toHaveBeenCalledWith(expect.stringContaining("[Formatted] I am currently offline"));
      expect(mockLLM.generate).not.toHaveBeenCalled();
    });

    it('should trigger typing indicator', async () => {
        mockPersonaEngine.isWithinWorkingHours.mockReturnValue(true);
        const mockTurnContext = { sendActivity: vi.fn().mockResolvedValue({}) };

        const engine = new TeamsEngine(mockLLM, mockRegistry, mockMCP, mockTurnContext as any);

        // Trigger typing
        engine['s'].start("Typing...");
        expect(mockTurnContext.sendActivity).toHaveBeenCalledWith(expect.objectContaining({
            type: ActivityTypes.Typing
        }));
    });
  });

  describe('DiscordEngine', () => {
    it('should send offline message and skip execution if outside working hours', async () => {
      mockPersonaEngine.isWithinWorkingHours.mockReturnValue(false);
      const mockChannel = { send: vi.fn().mockResolvedValue({}) };

      const engine = new DiscordEngine(mockLLM, mockRegistry, mockMCP, mockChannel as any);

      await engine.run(mockContext, "Hi");

      expect(mockChannel.send).toHaveBeenCalledWith(expect.stringContaining("[Formatted] I am currently offline"));
      expect(mockLLM.generate).not.toHaveBeenCalled();
    });

    it('should trigger typing indicator', async () => {
        mockPersonaEngine.isWithinWorkingHours.mockReturnValue(true);
        const mockChannel = {
            sendTyping: vi.fn().mockResolvedValue({}),
            send: vi.fn().mockResolvedValue({})
        };

        const engine = new DiscordEngine(mockLLM, mockRegistry, mockMCP, mockChannel as any);

        // Trigger typing
        engine['s'].start("Typing...");
        expect(mockChannel.sendTyping).toHaveBeenCalled();
    });
  });

});
