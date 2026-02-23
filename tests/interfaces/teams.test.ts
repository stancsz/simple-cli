import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
    EngineRun: vi.fn(),
    RegistryToolsSet: vi.fn(),
    McpInit: vi.fn(),
    McpGetTools: vi.fn().mockResolvedValue([]),
    GetActiveSkill: vi.fn().mockResolvedValue({ systemPrompt: 'test' }),
    CreateLLM: vi.fn().mockReturnValue({
        personaEngine: {
            loadConfig: vi.fn().mockResolvedValue(undefined),
            isWithinWorkingHours: vi.fn().mockReturnValue(true),
            formatMessage: vi.fn((msg) => msg),
            getConfig: vi.fn().mockReturnValue({})
        },
        generate: vi.fn()
    }),
    AdapterProcess: vi.fn(),
    OnMessage: vi.fn(),
    OnMembersAdded: vi.fn(),
    SendActivity: vi.fn().mockResolvedValue({}),
    SendActivities: vi.fn().mockResolvedValue({}),
    ExpressUse: vi.fn(),
    ExpressPost: vi.fn(),
    ExpressListen: vi.fn()
}));

vi.mock('botbuilder', () => {
    class ActivityHandler {
        constructor() {
            // console.log('Mock ActivityHandler instantiated');
        }
        onMessage(handler: any) {
            // console.log('Mock onMessage called');
            mocks.OnMessage(handler);
        }
        onMembersAdded(handler: any) {
            // console.log('Mock onMembersAdded called');
            mocks.OnMembersAdded(handler);
        }
    }
    return {
        ActivityHandler,
        CloudAdapter: vi.fn(() => ({
            process: mocks.AdapterProcess,
            onTurnError: null
        })),
        TurnContext: {
            removeRecipientMention: vi.fn((activity) => activity.text || ''),
        },
        MessageFactory: {
            text: vi.fn((text) => ({ text }))
        },
        ActivityTypes: {
            Typing: 'typing',
            MessageReaction: 'messageReaction'
        },
        ConfigurationServiceClientCredentialFactory: vi.fn(),
        createBotFrameworkAuthenticationFromConfiguration: vi.fn()
    };
});

vi.mock('express', () => {
    const app = {
        use: mocks.ExpressUse,
        post: mocks.ExpressPost,
        listen: mocks.ExpressListen
    };
    const express = () => app;
    express.json = vi.fn();
    return { default: express };
});

vi.mock('../../src/engine/orchestrator.js', () => ({
    Engine: vi.fn().mockImplementation(() => ({
        run: mocks.EngineRun,
        log: vi.fn()
    })),
    Context: vi.fn().mockImplementation(() => ({
        history: []
    })),
    Registry: vi.fn().mockImplementation(() => {
        const tools = new Map();
        const originalSet = tools.set.bind(tools);
        tools.set = vi.fn((k, v) => {
            mocks.RegistryToolsSet(k, v);
            return originalSet(k, v);
        });
        return {
            tools,
            loadProjectTools: vi.fn()
        };
    })
}));

vi.mock('../../src/llm.js', () => ({
    createLLM: mocks.CreateLLM
}));

vi.mock('../../src/mcp.js', () => ({
    MCP: vi.fn().mockImplementation(() => ({
        init: mocks.McpInit,
        getTools: mocks.McpGetTools
    }))
}));

vi.mock('../../src/skills.js', () => ({
    getActiveSkill: mocks.GetActiveSkill
}));

vi.mock('../../src/workflows/workflow_engine.js', () => ({
    WorkflowEngine: vi.fn()
}));

vi.mock('../../src/workflows/execute_sop_tool.js', () => ({
    createExecuteSOPTool: vi.fn().mockReturnValue({ name: 'execute_sop' })
}));

import { adapter, bot, app, resetInitialization } from '../../src/interfaces/teams.js';

describe('Teams Interface Adapter', () => {
    beforeEach(() => {
        mocks.EngineRun.mockClear();
        mocks.SendActivity.mockClear();
        mocks.SendActivities.mockClear();
        resetInitialization();
    });

    it('should initialize Adapter and Bot', () => {
        expect(adapter).toBeDefined();
        expect(bot).toBeDefined();
        const calls = mocks.OnMessage.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
    });

    it('should handle message activity and send reaction', async () => {
        const handler = mocks.OnMessage.mock.calls[0][0];
        expect(handler).toBeDefined();

        const mockContext: any = {
            activity: { id: 'msg123', text: 'help me', recipient: { id: 'bot' } },
            sendActivity: mocks.SendActivity,
            sendActivities: mocks.SendActivities
        };
        const next = vi.fn();

        // Invoke handler
        await handler(mockContext, next);

        // Verify reaction was sent
        expect(mocks.SendActivities).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                type: 'messageReaction',
                reactionsAdded: [{ type: 'like' }],
                replyToId: 'msg123'
            })
        ]));

        // Verify Engine flow
        expect(mocks.McpInit).toHaveBeenCalled();
        expect(mocks.CreateLLM).toHaveBeenCalled();
        expect(mocks.EngineRun).toHaveBeenCalledWith(expect.anything(), 'help me', { interactive: false });

        // Verify response
        expect(mocks.SendActivity).toHaveBeenCalledWith("I couldn't generate a response.");
        expect(next).toHaveBeenCalled();
    });

    it('should handle attachments', async () => {
        const handler = mocks.OnMessage.mock.calls[0][0];

        const mockContext: any = {
            activity: {
                id: 'msg456',
                text: 'here is a file',
                recipient: { id: 'bot' },
                attachments: [{ name: 'test.txt', contentUrl: 'http://example.com/test.txt' }]
            },
            sendActivity: mocks.SendActivity,
            sendActivities: mocks.SendActivities
        };
        const next = vi.fn();

        await handler(mockContext, next);

        // Verify attachment acknowledgement
        expect(mocks.SendActivity).toHaveBeenCalledWith(expect.stringContaining('Received attachments: test.txt'));
        expect(next).toHaveBeenCalled();
    });

    it('should handle members added', async () => {
        const handler = mocks.OnMembersAdded.mock.calls[0][0];
        expect(handler).toBeDefined();

        const mockContext: any = {
            activity: {
                membersAdded: [{ id: 'user1' }],
                recipient: { id: 'bot' }
            },
            sendActivity: mocks.SendActivity
        };
        const next = vi.fn();

        await handler(mockContext, next);

        expect(mocks.SendActivity).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });

    it('should setup express routes', () => {
        expect(mocks.ExpressPost).toHaveBeenCalledWith('/api/messages', expect.any(Function));
    });
});
