import { describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    EngineRun: vi.fn(),
    RegistryToolsSet: vi.fn(),
    RegistryLoadProjectTools: vi.fn(),
    McpInit: vi.fn(),
    McpGetTools: vi.fn().mockResolvedValue([]),
    GetActiveSkill: vi.fn().mockResolvedValue({ systemPrompt: 'test' }),
    CreateLLM: vi.fn(),
    AppEvent: vi.fn(),
    AppAction: vi.fn(),
    AppStart: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('@slack/bolt', () => ({
    default: { App: vi.fn(() => ({ event: mocks.AppEvent, action: mocks.AppAction, start: mocks.AppStart })) },
    App: vi.fn(() => ({ event: mocks.AppEvent, action: mocks.AppAction, start: mocks.AppStart }))
}));

vi.mock('../../src/engine/orchestrator.js', () => ({
    Engine: vi.fn().mockImplementation(() => ({
        run: mocks.EngineRun
    })),
    Context: vi.fn().mockImplementation(() => ({
        history: []
    })),
    Registry: vi.fn().mockImplementation(() => {
        const tools = new Map();
        // Spy on set to allow verification but keep Map functionality
        const originalSet = tools.set.bind(tools);
        tools.set = vi.fn((k, v) => {
            mocks.RegistryToolsSet(k, v);
            return originalSet(k, v);
        });
        return {
            tools,
            loadProjectTools: mocks.RegistryLoadProjectTools
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

vi.mock('../../src/builtins.js', () => ({
    allBuiltins: []
}));

vi.mock('../../src/workflows/workflow_engine.js', () => ({
    WorkflowEngine: vi.fn()
}));

vi.mock('../../src/workflows/execute_sop_tool.js', () => ({
    createExecuteSOPTool: vi.fn().mockReturnValue({ name: 'execute_sop' })
}));

// Import the module under test
import { app } from '../../src/interfaces/slack.js';

describe('Slack Interface Adapter', () => {
    it('should initialize Bolt App', () => {
        expect(app).toBeDefined();
        // Check if event listener was registered
        expect(mocks.AppEvent).toHaveBeenCalledWith('app_mention', expect.any(Function));
    });

    it('should handle app_mention event', async () => {
        // Extract the event handler
        const calls = mocks.AppEvent.mock.calls;
        const eventHandler = calls.find((call: any[]) => call[0] === 'app_mention')[1];
        expect(eventHandler).toBeDefined();

        const mockSay = vi.fn();
        const mockClient = {
            chat: { postMessage: vi.fn() },
            reactions: { add: vi.fn() }
        };

        // Invoke handler
        await eventHandler({
            event: { channel: 'C123', text: '<@U123> help me', ts: '123.456' },
            say: mockSay,
            client: mockClient
        });

        // Verify Engine flow
        expect(mocks.McpInit).toHaveBeenCalled();
        expect(mocks.CreateLLM).toHaveBeenCalled();
        expect(mocks.EngineRun).toHaveBeenCalledWith(expect.anything(), 'help me', { interactive: false });

        // Since mock history is empty, it should say "I couldn't generate a response."
        expect(mockClient.chat.postMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "I couldn't generate a response." }));
    });
});
