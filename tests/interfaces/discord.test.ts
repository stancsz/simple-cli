import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Events, TextChannel } from 'discord.js';

// Mocks
const mockSend = vi.fn().mockResolvedValue(true);
const mockReply = vi.fn().mockResolvedValue(true);
const mockReact = vi.fn().mockResolvedValue(true);
const mockSendTyping = vi.fn().mockResolvedValue(true);

const mockChannel = {
  send: mockSend,
  sendTyping: mockSendTyping,
} as unknown as TextChannel;

const mockMessage = {
  content: '',
  author: { bot: false },
  mentions: { users: { has: () => false } },
  guild: {},
  channel: mockChannel,
  reply: mockReply,
  react: mockReact,
} as any;

const mockClientOn = vi.fn();
const mockClientOnce = vi.fn();
const mockLogin = vi.fn();

const mockUser = { id: 'bot-id', tag: 'Bot#1234' };

vi.mock('discord.js', async () => {
  const actual = await vi.importActual('discord.js');
  return {
    ...actual,
    Client: vi.fn().mockImplementation(() => ({
      on: mockClientOn,
      once: mockClientOnce,
      login: mockLogin,
      user: mockUser,
    })),
    GatewayIntentBits: {
        Guilds: 1,
        GuildMessages: 2,
        MessageContent: 4,
        DirectMessages: 8
    },
    Partials: { Channel: 1 }
  };
});

// Mock Engine to avoid actual execution
const mockRun = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/engine/orchestrator.js', async () => {
    return {
        Engine: class {
            constructor() {}
            run = mockRun;
            log = vi.fn();
            getUserInput = vi.fn();
        },
        Context: class {
             constructor() {
                 this.history = [{ role: 'assistant', content: '{"message": "Hello World"}' }];
             }
        },
        Registry: class {
            tools = new Map();
        }
    }
});

// Mock other dependencies to avoid side effects
vi.mock('../../src/llm.js', () => ({
    createLLM: () => ({})
}));
vi.mock('../../src/mcp.js', () => ({
    MCP: class {
        init = vi.fn().mockResolvedValue(undefined);
        getTools = vi.fn().mockResolvedValue([]);
    }
}));
vi.mock('../../src/skills.js', () => ({
    getActiveSkill: vi.fn().mockResolvedValue({})
}));
vi.mock('../../src/workflows/workflow_engine.js', () => ({
    WorkflowEngine: class {}
}));
vi.mock('../../src/workflows/execute_sop_tool.js', () => ({
    createExecuteSOPTool: () => ({ name: 'sop', execute: vi.fn() })
}));

describe('Discord Interface', () => {
    let messageHandler: any;

    // Use beforeAll to capture the handler once, as ESM modules are cached and side-effects run once.
    beforeAll(async () => {
        process.env.DISCORD_BOT_TOKEN = 'test-token';
        // Import triggers the side effects (client creation and event registration)
        await import('../../src/interfaces/discord.js');

        // Capture the handler
        const call = mockClientOn.mock.calls.find((call: any[]) => call[0] === Events.MessageCreate);
        if (call) {
            messageHandler = call[1];
        }
    });

    beforeEach(() => {
        // Only clear operation mocks, not the setup mocks
        mockReply.mockClear();
        mockReact.mockClear();
        mockSendTyping.mockClear();
        mockRun.mockClear();
        mockChannel.send.mockClear();
    });

    it('should register messageCreate event handler', () => {
        expect(messageHandler).toBeDefined();
        expect(messageHandler).toBeTypeOf('function');
    });

    it('should respond to !ping', async () => {
        const msg = { ...mockMessage, content: '!ping', mentions: { users: { has: () => true } } }; // Mention to ensure it processes
        await messageHandler(msg);

        expect(mockReply).toHaveBeenCalledWith('Pong!');
    });

    it('should run engine on mentioned message', async () => {
        const msg = {
            ...mockMessage,
            content: '<@bot-id> help me',
            mentions: { users: { has: (id: string) => id === 'bot-id' } }
        };

        await messageHandler(msg);

        expect(mockReact).toHaveBeenCalledWith('👍');
        expect(mockChannel.sendTyping).toHaveBeenCalled();
        expect(mockReply).toHaveBeenCalledWith('Thinking...');
        expect(mockRun).toHaveBeenCalled();

        // Check if final response was sent (mocked Context puts "Hello World" in history)
        expect(mockReply).toHaveBeenCalledWith('Hello World');
    });

    it('should ignore bots', async () => {
         const msg = { ...mockMessage, author: { bot: true } };
         await messageHandler(msg);
         expect(mockReply).not.toHaveBeenCalled();
    });
});
